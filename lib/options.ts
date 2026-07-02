import type { ConditionKey, DrugTier, PlannedEventKey } from "@/lib/types";
import { SUPPORTED_STATE_CODES } from "@/lib/data/plans";

// Full names for every US state code, so a state added by the ingester automatically shows a
// friendly label in the picker with no extra edit here.
const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri",
  MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio",
  OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
  DC: "District of Columbia",
};

// Every state the app actually has real plan data for, sorted by name. Derived from
// states.json (written by the ingester), so it never drifts from what can be loaded.
export const SUPPORTED_STATES: { code: string; name: string }[] = SUPPORTED_STATE_CODES.map(
  (code) => ({ code, name: STATE_NAMES[code] ?? code }),
).sort((a, b) => a.name.localeCompare(b.name));

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
