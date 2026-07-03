//! NeuGrid Chain Fusion signer — the PoC canister (workstream A3.1 on docs/ROADMAP.md).
//!
//! An ICP canister that holds a threshold-Ed25519 key (the exact scheme Solana
//! uses) and signs Solana transaction messages with it. Nobody — not NeuGrid,
//! not the canister deployer — ever sees the private key: it exists only as
//! shares across the ICP subnet. This is the primitive that lets a canister BE
//! the escrow/mandate authority over real Solana USDC (see docs/ICP_INTEGRATION.md).
//!
//! PoC scope: derive the Solana address + sign an externally-built message.
//! The production path adds the SOL RPC canister for reads/submission and a
//! durable-nonce flow (Solana blockhashes rotate faster than outcall latency).

use ic_cdk::management_canister::{
    schnorr_public_key, sign_with_schnorr, SchnorrAlgorithm, SchnorrKeyId,
    SchnorrPublicKeyArgs, SignWithSchnorrArgs,
};
use std::cell::RefCell;

thread_local! {
    /// "dfx_test_key" locally · "test_key_1" / "key_1" on ICP mainnet.
    static KEY_NAME: RefCell<String> = RefCell::new("dfx_test_key".to_string());
}

const DERIVATION: &[u8] = b"neugrid-escrow-v1";

fn key_id() -> SchnorrKeyId {
    SchnorrKeyId {
        algorithm: SchnorrAlgorithm::Ed25519,
        name: KEY_NAME.with(|k| k.borrow().clone()),
    }
}

#[ic_cdk::init]
fn init(key_name: Option<String>) {
    if let Some(name) = key_name {
        KEY_NAME.with(|k| *k.borrow_mut() = name);
    }
}

/// The canister's Solana address (base58 of its threshold-Ed25519 public key).
#[ic_cdk::update]
async fn solana_address() -> String {
    let res = schnorr_public_key(&SchnorrPublicKeyArgs {
        canister_id: None,
        derivation_path: vec![DERIVATION.to_vec()],
        key_id: key_id(),
    })
    .await
    .expect("schnorr_public_key failed");
    bs58::encode(&res.public_key).into_string()
}

/// Sign a serialized Solana transaction MESSAGE (not the full transaction).
/// Returns the 64-byte Ed25519 signature to slot into the transaction.
#[ic_cdk::update]
async fn sign_solana_message(message: Vec<u8>) -> Vec<u8> {
    // PoC guard: refuse absurd payloads; real deployments enforce a policy here
    // (who may request signatures, over which instruction shapes).
    assert!(message.len() <= 1232, "not a Solana-sized message");
    let res = sign_with_schnorr(&SignWithSchnorrArgs {
        message,
        derivation_path: vec![DERIVATION.to_vec()],
        key_id: key_id(),
        aux: None,
    })
    .await
    .expect("sign_with_schnorr failed");
    res.signature
}
