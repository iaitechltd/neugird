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
    /// The milestone_vault program id (raw 32 bytes) `sign_vault_release` signs for.
    static VAULT_PROGRAM: RefCell<Option<[u8; 32]>> = const { RefCell::new(None) };
}

/// Anchor discriminator of milestone_vault's `vote` — sha256("global:vote")[0..8].
const VOTE_DISCRIMINATOR: [u8; 8] = [227, 110, 155, 23, 136, 126, 172, 25];

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

/// Upgrades wipe thread_local state and skip `init` — re-apply the key name here.
/// (`set_vault_program` must also be re-called after an upgrade.)
#[ic_cdk::post_upgrade]
fn post_upgrade(key_name: Option<String>) {
    init(key_name);
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
/// CONTROLLER-ONLY since the policy layer landed — everyone else goes through
/// `sign_vault_release`, which enforces the instruction shape.
#[ic_cdk::update]
async fn sign_solana_message(message: Vec<u8>) -> Vec<u8> {
    assert!(
        ic_cdk::api::is_controller(&ic_cdk::api::msg_caller()),
        "sign_solana_message is controller-only; use sign_vault_release"
    );
    assert!(message.len() <= 1232, "not a Solana-sized message");
    sign(message).await
}

/// Set the milestone_vault program id (base58) `sign_vault_release` is scoped to.
#[ic_cdk::update]
fn set_vault_program(program_id: String) {
    assert!(
        ic_cdk::api::is_controller(&ic_cdk::api::msg_caller()),
        "controller-only"
    );
    let bytes = bs58::decode(&program_id).into_vec().expect("bad base58");
    let arr: [u8; 32] = bytes.try_into().expect("program id must be 32 bytes");
    VAULT_PROGRAM.with(|p| *p.borrow_mut() = Some(arr));
}

/// The configured vault program id, if any.
#[ic_cdk::query]
fn vault_program() -> Option<String> {
    VAULT_PROGRAM.with(|p| p.borrow().map(|b| bs58::encode(&b).into_string()))
}

/// THE POLICY PATH (A3): sign a milestone-vault release. Open to any caller, but
/// the canister only signs when the presented message is exactly release-shaped:
/// a legacy Solana message whose every instruction targets the configured vault
/// program (`vote` only) or the ComputeBudget program. The threshold key thus
/// co-signs tranche releases and NOTHING else — a compromised platform key still
/// cannot move escrow anywhere the program's vote math doesn't send it.
#[ic_cdk::update]
async fn sign_vault_release(message: Vec<u8>) -> Vec<u8> {
    assert!(message.len() <= 1232, "not a Solana-sized message");
    let vault_program = VAULT_PROGRAM
        .with(|p| *p.borrow())
        .expect("vault program not configured");
    let compute_budget: [u8; 32] = bs58::decode("ComputeBudget111111111111111111111111111111")
        .into_vec()
        .unwrap()
        .try_into()
        .unwrap();

    let msg = parse_legacy_message(&message).expect("unparseable Solana message");
    let mut vote_instructions = 0usize;
    for ix in &msg.instructions {
        let program = msg
            .account_keys
            .get(ix.program_id_index as usize)
            .expect("program index out of range");
        if *program == vault_program {
            assert!(
                ix.data.len() >= 8 && ix.data[..8] == VOTE_DISCRIMINATOR,
                "vault instruction is not `vote`"
            );
            vote_instructions += 1;
        } else if *program == compute_budget {
            // fee-tuning instructions are harmless
        } else {
            panic!("message contains an instruction outside the release shape");
        }
    }
    assert!(vote_instructions > 0, "no vault vote instruction present");
    sign(message).await
}

async fn sign(message: Vec<u8>) -> Vec<u8> {
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

/* ------------------- minimal legacy-message parsing ------------------- */
// Solana legacy message: header(3) · compact-u16 keys · blockhash(32) ·
// compact-u16 instructions (program_id_index u8, compact accounts, compact data).
// Versioned messages (first byte & 0x80) are rejected — the adapter builds legacy.

struct ParsedInstruction {
    program_id_index: u8,
    data: Vec<u8>,
}

struct ParsedMessage {
    account_keys: Vec<[u8; 32]>,
    instructions: Vec<ParsedInstruction>,
}

fn compact_u16(buf: &[u8], pos: &mut usize) -> Option<usize> {
    let mut value = 0usize;
    for i in 0..3 {
        let byte = *buf.get(*pos)? as usize;
        *pos += 1;
        value |= (byte & 0x7f) << (7 * i);
        if byte & 0x80 == 0 {
            return Some(value);
        }
    }
    None
}

fn parse_legacy_message(buf: &[u8]) -> Option<ParsedMessage> {
    if buf.first()? & 0x80 != 0 {
        return None; // versioned message — out of policy
    }
    let mut pos = 3; // header
    let n_keys = compact_u16(buf, &mut pos)?;
    let mut account_keys = Vec::with_capacity(n_keys);
    for _ in 0..n_keys {
        let key: [u8; 32] = buf.get(pos..pos + 32)?.try_into().ok()?;
        account_keys.push(key);
        pos += 32;
    }
    pos += 32; // recent blockhash
    let n_instr = compact_u16(buf, &mut pos)?;
    let mut instructions = Vec::with_capacity(n_instr);
    for _ in 0..n_instr {
        let program_id_index = *buf.get(pos)?;
        pos += 1;
        let n_accounts = compact_u16(buf, &mut pos)?;
        pos += n_accounts; // account indexes — the program constrains them
        let data_len = compact_u16(buf, &mut pos)?;
        let data = buf.get(pos..pos + data_len)?.to_vec();
        pos += data_len;
        instructions.push(ParsedInstruction { program_id_index, data });
    }
    if pos != buf.len() {
        return None; // trailing garbage — refuse
    }
    Some(ParsedMessage { account_keys, instructions })
}
