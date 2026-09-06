export const HDD_MODELS = [
  { id: "gpt-5.5", label: "5.5" },
  { id: "gpt-5.6-luna", label: "5.6 Luna" },
  { id: "gpt-5.6-terra", label: "5.6 Terra" },
  { id: "gpt-5.6-sol", label: "5.6 Sol" },
] as const;

export type HddModelId = typeof HDD_MODELS[number]["id"];

export const HDD_REASONING_EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;

export type HddReasoningEffort = typeof HDD_REASONING_EFFORTS[number];
