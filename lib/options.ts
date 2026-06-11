import type { ConditionKey, DrugTier, PlannedEventKey } from "@/lib/types";

export const SUPPORTED_STATES: { code: string; name: string }[] = [
  { code: "TX", name: "Texas" },
  { code: "FL", name: "Florida" },
  { code: "NC", name: "North Carolina" },
  { code: "OH", name: "Ohio" },
];

export const CONDITION_OPTIONS: { key: ConditionKey; label: string }[] = [
  { key: "diabetesType2", label: "Type 2 diabetes" },
  { key: "diabetesType1", label: "Type 1 diabetes" },
  { key: "hypertension", label: "High blood pressure" },
  { key: "highCholesterol", label: "High cholesterol" },
  { key: "asthma", label: "Asthma" },
  { key: "copd", label: "COPD" },
  { key: "depressionAnxiety", label: "Depression / anxiety" },
  { key: "heartDisease", label: "Heart disease" },
  { key: "cancerActive", label: "Cancer (in treatment)" },
  { key: "arthritis", label: "Arthritis" },
  { key: "migraine", label: "Migraine" },
  { key: "thyroid", label: "Thyroid disorder" },
];

export const EVENT_OPTIONS: { key: PlannedEventKey; label: string }[] = [
  { key: "pregnancy", label: "Having a baby" },
  { key: "tryingToConceive", label: "Trying to conceive" },
  { key: "plannedSurgery", label: "A planned surgery" },
  { key: "therapyWeekly", label: "Weekly therapy" },
  { key: "physicalTherapy", label: "Physical therapy" },
];

export const DRUG_TIER_OPTIONS: { key: DrugTier; label: string }[] = [
  { key: "genericDrugs", label: "Generic" },
  { key: "preferredBrandDrugs", label: "Preferred brand" },
  { key: "nonPreferredBrandDrugs", label: "Non-preferred brand" },
  { key: "specialtyDrugs", label: "Specialty" },
];

export const EMPLOYER_BANDS: { key: string; label: string; repAge: number }[] = [
  { key: "u30", label: "Under 30", repAge: 26 },
  { key: "30s", label: "30–39", repAge: 35 },
  { key: "40s", label: "40–49", repAge: 45 },
  { key: "50s", label: "50–59", repAge: 55 },
  { key: "60p", label: "60+", repAge: 62 },
];

export const RISK_OPTIONS: {
  key: "low" | "medium" | "high";
  label: string;
  hint: string;
}[] = [
  { key: "low", label: "Play it safe", hint: "Protect against a bad year" },
  { key: "medium", label: "Balanced", hint: "Weigh cost and risk evenly" },
  { key: "high", label: "Bet on health", hint: "Chase the lowest expected cost" },
];
