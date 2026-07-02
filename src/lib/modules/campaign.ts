/**
 * CampaignCanister — campaigns, tasks, submissions, and review.
 * On approval it awards Pulse via the PulseCanister, keeping reputation and
 * coordination in lockstep (the core MVP loop).
 */

import { db } from "../store";
import { newId, nowISO } from "../id";
import * as Pulse from "./pulse";
import type {
  Campaign,
  ProofType,
  ReviewMethod,
  Submission,
  Task,
  TaskType,
} from "../types";

export function listCampaigns(grid_id?: string): Campaign[] {
  return grid_id ? db.campaigns.filter((c) => c.grid_id === grid_id) : db.campaigns;
}

export function getCampaign(id: string): Campaign | undefined {
  return db.campaigns.find((c) => c.campaign_id === id);
}

export interface CreateCampaignInput {
  grid_id: string;
  subgrid_id?: string;
  title: string;
  objective: string;
  reward_pool: number;
  start_date?: string;
  end_date?: string;
  review_rules?: ReviewMethod;
  created_by: string;
}

export function createCampaign(input: CreateCampaignInput): Campaign {
  const campaign: Campaign = {
    campaign_id: newId("camp"),
    grid_id: input.grid_id,
    subgrid_id: input.subgrid_id,
    title: input.title,
    objective: input.objective,
    task_ids: [],
    reward_pool: input.reward_pool,
    start_date: input.start_date ?? nowISO(),
    end_date: input.end_date ?? nowISO(),
    status: "active",
    review_rules: input.review_rules ?? "manual",
    metrics: { submissions: 0, approved: 0, rejected: 0, contributors: 0, pulse_generated: 0 },
    created_by: input.created_by,
    created_at: nowISO(),
  };
  db.campaigns.push(campaign);
  return campaign;
}

export interface AddTaskInput {
  campaign_id: string;
  type: TaskType;
  title: string;
  description: string;
  reward: number;
  proof_required?: ProofType;
}

export function addTask(input: AddTaskInput): Task {
  const task: Task = {
    task_id: newId("task"),
    campaign_id: input.campaign_id,
    type: input.type,
    title: input.title,
    description: input.description,
    reward: input.reward,
    proof_required: input.proof_required ?? "link",
    status: "open",
    created_at: nowISO(),
  };
  db.tasks.push(task);
  const c = getCampaign(input.campaign_id);
  if (c) c.task_ids.push(task.task_id);
  return task;
}

export function listTasks(campaign_id: string): Task[] {
  return db.tasks.filter((t) => t.campaign_id === campaign_id);
}

export interface SubmitInput {
  task_id: string;
  user_id: string;
  proof: string;
}

export function submit(input: SubmitInput): Submission | undefined {
  const task = db.tasks.find((t) => t.task_id === input.task_id);
  if (!task) return undefined;
  const submission: Submission = {
    submission_id: newId("sub"),
    task_id: task.task_id,
    campaign_id: task.campaign_id,
    user_id: input.user_id,
    proof: input.proof,
    reviewer_status: "pending",
    reward_status: "unpaid",
    pulse_delta: 0,
    created_at: nowISO(),
  };
  db.submissions.unshift(submission);
  const c = getCampaign(task.campaign_id);
  if (c) c.metrics.submissions += 1;
  return submission;
}

export function listSubmissions(opts?: {
  campaign_id?: string;
  status?: Submission["reviewer_status"];
}): Submission[] {
  let subs = db.submissions;
  if (opts?.campaign_id) subs = subs.filter((s) => s.campaign_id === opts.campaign_id);
  if (opts?.status) subs = subs.filter((s) => s.reviewer_status === opts.status);
  return subs;
}

export interface ReviewInput {
  submission_id: string;
  approved: boolean;
  quality_score?: number;
  reviewer_id: string;
}

export function review(input: ReviewInput): Submission | undefined {
  const sub = db.submissions.find((s) => s.submission_id === input.submission_id);
  if (!sub || sub.reviewer_status !== "pending") return sub;

  const task = db.tasks.find((t) => t.task_id === sub.task_id);
  const campaign = getCampaign(sub.campaign_id);
  sub.reviewed_by = input.reviewer_id;
  sub.reviewed_at = nowISO();

  if (input.approved) {
    const quality = input.quality_score ?? 75;
    const { weight, reason } = Pulse.weightForApproval(task?.reward ?? 0, quality);
    sub.reviewer_status = "approved";
    sub.quality_score = quality;
    sub.reward_status = "paid";
    sub.pulse_delta = weight;
    Pulse.recordEvent({
      target_type: "user",
      target_id: sub.user_id,
      user_id: sub.user_id,
      action_type: "submission_approved",
      weight,
      reason,
      verification_source: `reviewer:${input.reviewer_id}`,
    });
    if (campaign) {
      campaign.metrics.approved += 1;
      campaign.metrics.pulse_generated += weight;
    }
  } else {
    sub.reviewer_status = "rejected";
    sub.reward_status = "void";
    if (campaign) campaign.metrics.rejected += 1;
  }
  return sub;
}
