//! NeuGrid cron canister — ICP timers replacing Cloud Scheduler (A3 on
//! docs/ROADMAP.md). On-chain timers fire HTTPS outcalls at the platform's
//! cron endpoints, so the "24/7 heartbeat" of the agent economy runs from the
//! Internet Computer instead of a cloud scheduler.
//!
//! Outcalls use `is_replicated = false` (a single replica performs the request),
//! so the non-idempotent tick endpoints see exactly one call per firing. The
//! platform routes additionally dedupe on the `x-ng-cron-tick` header as
//! defense in depth.

use candid::{CandidType, Deserialize};
use ic_cdk::management_canister::{http_request, HttpHeader, HttpMethod, HttpRequestArgs};
use std::cell::RefCell;
use std::time::Duration;

#[derive(CandidType, Deserialize, Clone)]
struct CronConfig {
    /// e.g. "https://neugrid-188737658015.us-central1.run.app"
    base_url: String,
    /// sent as `x-ng-cron-key` (empty string = no auth, dev mode)
    cron_key: String,
    /// agent-work cadence (Cloud Scheduler parity: 600)
    agent_work_secs: u64,
    /// reputation cadence (Cloud Scheduler parity: 86400)
    reputation_secs: u64,
    /// agent-trading cadence (the Agent-Mode 24/7 runner; 0 = off)
    agent_trading_secs: u64,
}

#[derive(CandidType, Deserialize, Clone, Default)]
struct JobStatus {
    fired: u64,
    last_status: u64,
    last_at_ns: u64,
    last_error: String,
}

#[derive(CandidType, Deserialize, Clone, Default)]
struct CronStatus {
    agent_work: JobStatus,
    reputation: JobStatus,
    agent_trading: JobStatus,
}

thread_local! {
    static CONFIG: RefCell<Option<CronConfig>> = const { RefCell::new(None) };
    static STATUS: RefCell<CronStatus> = RefCell::new(CronStatus::default());
}

fn start_timers() {
    let Some(cfg) = CONFIG.with(|c| c.borrow().clone()) else { return };
    ic_cdk_timers::set_timer_interval(Duration::from_secs(cfg.agent_work_secs), || fire("agent-work"));
    ic_cdk_timers::set_timer_interval(Duration::from_secs(cfg.reputation_secs), || fire("reputation"));
    if cfg.agent_trading_secs > 0 {
        ic_cdk_timers::set_timer_interval(Duration::from_secs(cfg.agent_trading_secs), || fire("agent-trading"));
    }
}

async fn fire(job: &'static str) {
    let Some(cfg) = CONFIG.with(|c| c.borrow().clone()) else { return };
    let url = format!("{}/api/cron/{}", cfg.base_url.trim_end_matches('/'), job);
    let mut headers = vec![HttpHeader {
        name: "x-ng-cron-tick".to_string(),
        value: format!("icp-{}-{}", job, ic_cdk::api::time()),
    }];
    if !cfg.cron_key.is_empty() {
        headers.push(HttpHeader { name: "x-ng-cron-key".to_string(), value: cfg.cron_key.clone() });
    }
    let result = http_request(&HttpRequestArgs {
        url,
        method: HttpMethod::POST,
        headers,
        body: None,
        max_response_bytes: Some(4096),
        transform: None,
        is_replicated: Some(false), // one replica, one request — ticks are not idempotent
    })
    .await;

    STATUS.with(|s| {
        let mut status = s.borrow_mut();
        let entry = match job {
            "agent-work" => &mut status.agent_work,
            "agent-trading" => &mut status.agent_trading,
            _ => &mut status.reputation,
        };
        entry.fired += 1;
        entry.last_at_ns = ic_cdk::api::time();
        match result {
            Ok(res) => {
                entry.last_status = u64::try_from(res.status.0.clone()).unwrap_or(0);
                entry.last_error = String::new();
            }
            Err(e) => {
                entry.last_status = 0;
                entry.last_error = format!("{e:?}");
            }
        }
    });
}

#[ic_cdk::init]
fn init(config: Option<CronConfig>) {
    if let Some(cfg) = config {
        CONFIG.with(|c| *c.borrow_mut() = Some(cfg));
    }
    start_timers();
}

/// Upgrades wipe timers and thread_local state — re-apply the config here.
#[ic_cdk::post_upgrade]
fn post_upgrade(config: Option<CronConfig>) {
    init(config);
}

/// Fire a job immediately (controller-only) — used for smoke tests / catch-up.
#[ic_cdk::update]
async fn fire_now(job: String) -> CronStatus {
    assert!(
        ic_cdk::api::is_controller(&ic_cdk::api::msg_caller()),
        "controller-only"
    );
    let job: &'static str = match job.as_str() {
        "agent-work" => "agent-work",
        "reputation" => "reputation",
        "agent-trading" => "agent-trading",
        _ => panic!("unknown job"),
    };
    fire(job).await;
    STATUS.with(|s| s.borrow().clone())
}

/// Firing counters + the last HTTP status per job.
#[ic_cdk::query]
fn status() -> CronStatus {
    STATUS.with(|s| s.borrow().clone())
}
