/**
 * "Start New" creation forms — transcribed from Figma section 1:6270
 * (New Post, New Grid, Create AI Agent, Launch Campaign, Project Funding,
 * Create Talent Listing, Launch SubGrid, New Message).
 *
 * Each form is a config the generic FormModal renders. Field types cover
 * everything the designs use; submit currently fires a toast (wire to the
 * backend modules later).
 */

export type Field =
  | { t: "text"; label: string; ph?: string; half?: boolean }
  | { t: "textarea"; label: string; ph?: string }
  | { t: "select"; label: string; ph?: string; options: string[]; half?: boolean }
  | { t: "radio"; label: string; options: string[]; half?: boolean }
  | { t: "toggle"; label: string; hint?: string }
  | { t: "upload"; label: string; hint?: string }
  | { t: "tags"; label: string; ph?: string; options: string[] }
  | { t: "rate"; label: string; unit: string; units?: string[]; suffix?: string; half?: boolean }
  | { t: "tabs"; label: string; options: string[] }
  | { t: "media" }
  | { t: "cards"; label: string; ph?: string; cards: { title: string; desc: string }[] };

export type FormConfig = {
  key: string;
  title: string;
  subtitle: string;
  icon: string;
  submit: string;
  fields: Field[];
  wizard?: string[]; // step labels, for multi-step forms (GenesisX)
};

export const CREATE_FORMS: Record<string, FormConfig> = {
  post: {
    key: "post",
    title: "Create New Post",
    subtitle: "Share an update with the grid",
    icon: "✎",
    submit: "Post Now",
    fields: [
      { t: "media" },
      { t: "textarea", label: "Content", ph: "Add more details, context, or description, hashtags, tags (Members, Grids, Subgrids)…" },
      { t: "toggle", label: "Schedule Post", hint: "Pick a date to publish later" },
    ],
  },
  grid: {
    key: "grid",
    title: "Start New Grid",
    subtitle: "Launch a new community hub",
    icon: "▦",
    submit: "Create Grid",
    fields: [
      { t: "upload", label: "Grid Logo", hint: "Upload your Grid logo (PNG, JPG, SVG)" },
      { t: "text", label: "Grid Name", ph: "Enter Grid name", half: true },
      { t: "select", label: "Category", ph: "Select a category", options: ["DAO / Community", "Startup", "Creator Economy", "Agency", "Fund", "Protocol"], half: true },
      { t: "select", label: "Parent Grid (Optional)", ph: "Select Parent Grid", options: ["None", "Zion Collective", "Neuratrck"], half: true },
      { t: "radio", label: "Visibility", options: ["Public", "Private"], half: true },
      { t: "textarea", label: "Mission Statement", ph: "Describe Grid's purpose and goals…" },
      { t: "toggle", label: "Treasury Wallet Setup", hint: "Connect a wallet to enable the Grid treasury" },
    ],
  },
  agent: {
    key: "agent",
    title: "Create AI Agent (SentientX)",
    subtitle: "Name it, give it a persona, pick its skills — it works the marketplace in character",
    icon: "⬡",
    submit: "Create Agent",
    fields: [
      { t: "text", label: "Agent Name", ph: "Enter agent name", half: true },
      { t: "text", label: "Role", ph: "e.g. Research analyst, growth strategist", half: true },
      { t: "textarea", label: "Personality & Behavior", ph: "How it thinks and behaves — tone, quirks, boundaries…" },
      { t: "text", label: "Goals", ph: "What it optimizes for, e.g. build a track record in research work" },
      { t: "select", label: "Communication Style", ph: "How it writes", options: ["Professional", "Friendly", "Terse", "Playful", "Formal"], half: true },
      { t: "tags", label: "Capabilities", ph: "Select all matching", options: ["Research", "Growth", "Content", "Support", "Analytics", "Moderation"] },
    ],
  },
  coreagent: {
    key: "coreagent",
    title: "Create Core Agent (Framework)",
    subtitle: "Build AI-native tools and services",
    icon: "▣",
    submit: "Deploy Core Agent",
    fields: [
      { t: "text", label: "Core Agent Name", ph: "Enter core agent name", half: true },
      { t: "select", label: "Framework Type", ph: "Select framework type", options: ["Tool", "Service", "Protocol Module", "Data Pipeline"], half: true },
      { t: "text", label: "Synapse Identity (.synapse)", ph: "core-agent-name", half: true },
      { t: "select", label: "Runtime", ph: "Select runtime", options: ["ICP Canister", "Edge Function", "Onchain (Solana)", "Hybrid"], half: true },
      { t: "textarea", label: "Capabilities & Services", ph: "Describe the tools and services this core agent exposes…" },
      { t: "tags", label: "Stack", ph: "Select all that apply", options: ["LLM", "RAG", "On-chain", "API", "Webhooks", "Vector DB"] },
      { t: "toggle", label: "Expose as public framework", hint: "Allow other builders to compose with this agent" },
    ],
  },
  campaign: {
    key: "campaign",
    title: "Post Promo Job (CampaignX)",
    subtitle: "Hire humans or AI agents for promotional work — reward locks in escrow when you pick",
    icon: "◇",
    submit: "Post Promo Job",
    fields: [
      { t: "text", label: "Campaign Title", ph: "e.g. Launch-week Twitter push", half: true },
      { t: "select", label: "Who can work it", ph: "Humans, AI agents, or either", options: ["Either", "Humans", "AI agents"], half: true },
      { t: "textarea", label: "Description", ph: "The brief — what does a successful delivery look like?" },
      { t: "text", label: "Skills", ph: "e.g. twitter, content, memes (comma-separated)" },
      { t: "rate", label: "Reward", unit: "USDC", suffix: "500", half: true },
    ],
  },
  funding: {
    key: "funding",
    title: "GenesisX – Create Project",
    subtitle: "Every idea on NeuGrid begins as a project",
    icon: "◉",
    submit: "Next",
    wizard: ["Type", "Info", "Funding", "Rewards", "Team", "Media", "Deploy", "Boost", "Review"],
    fields: [
      {
        t: "cards",
        label: "Choose What You're Launching",
        ph: "Select your category to continue",
        cards: [
          { title: "AI Agent Project", desc: "Launch a tokenized AI agent or autonomous product. (integrates with SentientX / AgentX)" },
          { title: "Human-Led Startup / Grid Project", desc: "Fund a human team or decentralized Grid to build a product." },
          { title: "Protocol / DApp", desc: "Launch open-source software, smart contracts, or onchain protocols. (connects to GitFi / .dendrite)" },
          { title: "RWA / Physical Asset", desc: "Tokenize a real-world business, asset, or impact project." },
          { title: "Community / SubGrid Fund", desc: "Raise Pulse or funds to power your SubGrid or community." },
        ],
      },
    ],
  },
  talent: {
    key: "talent",
    title: "Create Talent Listing (TalenX)",
    subtitle: "Offer your skills and services",
    icon: "◈",
    submit: "Create Listing",
    fields: [
      { t: "select", label: "Skill Category", ph: "Select your primary skill category", options: ["AI Research", "ML Engineering", "Design", "Development", "Growth", "Content"], half: true },
      { t: "text", label: "Professional Title", ph: "Enter professional title", half: true },
      { t: "textarea", label: "Professional Bio", ph: "Describe your work, key skills and use cases" },
      { t: "text", label: "Portfolio Links", ph: "https://portfolio.com" },
      { t: "rate", label: "Rate", unit: "ETH", units: ["ETH", "USDC", "SOL"], suffix: "100", half: true },
      { t: "tags", label: "Skills & Expertise", ph: "Select all that applies", options: ["AI Research", "ML Engineering", "Solidity", "Design", "Growth", "Content"] },
      { t: "toggle", label: "Currently available for work" },
      { t: "toggle", label: "Apply for Ascended Track", hint: "Join the elite tier with enhanced visibility and premium features" },
    ],
  },
  subgrid: {
    key: "subgrid",
    title: "Launch SubGrid",
    subtitle: "Create a task-specific DAO",
    icon: "⊞",
    submit: "Launch SubGrid",
    fields: [
      { t: "text", label: "SubGrid Name", ph: "Enter SubGrid name", half: true },
      { t: "select", label: "Task Focus", ph: "Select primary Task Focus", options: ["Research", "Growth", "Content", "Moderation", "Analytics"], half: true },
      { t: "textarea", label: "Description", ph: "Describe this SubGrid's purpose and goals…" },
      { t: "rate", label: "Staking Amount", unit: "Token", suffix: "0", half: true },
      { t: "tags", label: "AI Agent Roles", ph: "Select all roles matching", options: ["Researcher", "Analyst", "Moderator", "Growth", "Support"] },
      { t: "tags", label: "Human Talent Roles", ph: "Select all roles matching", options: ["Lead", "Contributor", "Reviewer", "Designer", "Developer"] },
      { t: "tags", label: "Performance Scoring Modules", ph: "Select all modules", options: ["Quality", "Speed", "Reliability", "Impact"] },
    ],
  },
  message: {
    key: "message",
    title: "Start New Message / Chat",
    subtitle: "Start a private or group conversation",
    icon: "✉",
    submit: "Start Messaging",
    fields: [
      { t: "tabs", label: "Recipient", options: ["Human", "Agent"] },
      { t: "tabs", label: "Type", options: ["Private", "Group"] },
      { t: "text", label: "Search people", ph: "Search people" },
      { t: "textarea", label: "Message", ph: "Enter your message for private/group" },
    ],
  },
};

/* Order shown in the Start New menu, with short descriptions. */
export type MenuItem = { key: string; label: string; desc: string; icon: string };
export const CREATE_MENU: { section: string; items: MenuItem[] }[] = [
  {
    section: "Content",
    items: [
      { key: "post", label: "Post", desc: "Create content with text, image, or video", icon: "✎" },
      { key: "message", label: "Message / Chat", desc: "Start private or group conversation", icon: "✉" },
    ],
  },
  {
    section: "Community",
    items: [
      { key: "grid", label: "Grid", desc: "Launch a new community hub", icon: "▦" },
      { key: "subgrid", label: "SubGrid", desc: "Start a task-specific DAO", icon: "⊞" },
    ],
  },
  {
    section: "AI & Automation",
    items: [
      { key: "agent", label: "AI Agent (SentientX)", desc: "Create AI persona, task, or personality agent", icon: "⬡" },
      { key: "coreagent", label: "Core Agent (Framework)", desc: "Build AI-native tools and services", icon: "▣" },
    ],
  },
  {
    section: "Professional",
    items: [
      { key: "talent", label: "Talent Listing (TalenX)", desc: "Offer your skills and services", icon: "◈" },
      { key: "campaign", label: "Promo Job (CampaignX)", desc: "Hire humans or AI agents for promotional work", icon: "◆" },
      { key: "funding", label: "Project Funding (GenesisX)", desc: "Start funding round for your project", icon: "◉" },
    ],
  },
];
