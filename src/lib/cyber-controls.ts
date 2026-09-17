import type { CyberControls } from "@/lib/store/types";

export type CyberGroupKey = keyof CyberControls;

export interface CyberControlItem {
  key: string;
  label: string;
  mandatory: boolean;
}

export interface CyberControlGroup {
  key: CyberGroupKey;
  label: string;
  items: CyberControlItem[];
  /**
   * All-optional group whose items the template still prints across BOTH column
   * positions — with NO border between the cells (the docx sets nil tcBorders on
   * the shared edge in II-B2 and III-A.2). Index where the left run ends; the
   * split is text alignment, never a mandatory/optional classification.
   */
  noSeparatorSplit?: number;
}

export const CYBER_GROUPS: CyberControlGroup[] = [
  {
    key: "physical",
    label: "Physical Security",
    items: [
      { key: "perimeterProtection", label: "Perimeter Protection", mandatory: true },
      { key: "accessControl", label: "Access Control", mandatory: true },
      { key: "surveillance", label: "Surveillance System", mandatory: true },
      { key: "detection", label: "Detection System", mandatory: false },
    ],
  },
  {
    key: "perimeter",
    label: "Perimeter Security",
    items: [
      { key: "ngfw", label: "Next Generation Firewalls", mandatory: true },
      { key: "idsIps", label: "Intrusion Detection/Prevention Systems (IDS/IPS)", mandatory: true },
      { key: "waf", label: "Web Application Firewalls (WAFs)", mandatory: true },
      { key: "dmz", label: "Demilitarized Zone (DMZ)", mandatory: false },
    ],
  },
  {
    key: "network",
    label: "Network Security",
    items: [
      { key: "dataEncryption", label: "Data Encryption", mandatory: true },
      { key: "networkSegmentation", label: "Network Segmentation", mandatory: false },
    ],
  },
  {
    key: "endpoint",
    label: "Endpoint Security",
    items: [
      { key: "antivirus", label: "Anti-virus and Anti-malware Software", mandatory: true },
      { key: "appControl", label: "Application Control", mandatory: true },
      { key: "byod", label: "BYOD Security", mandatory: true },
      { key: "xdr", label: "Extended Detection and Response (XDR)", mandatory: false },
    ],
  },
  {
    key: "data",
    label: "Data Security",
    items: [
      { key: "dataClassification", label: "Data Classification", mandatory: true },
      { key: "dlp", label: "Data Loss Prevention (DLP)", mandatory: true },
      { key: "backupRecovery", label: "Data Backups and Recovery", mandatory: true },
    ],
  },
  {
    key: "application",
    label: "Application Security",
    items: [
      { key: "securityScanning", label: "Regular Security Scanning and Testing", mandatory: true },
    ],
  },
  {
    key: "other",
    label: "Other Measures",
    noSeparatorSplit: 6,
    items: [
      { key: "vulnAssessment", label: "Vulnerability Assessment", mandatory: false },
      { key: "patchMgmt", label: "Patch Management", mandatory: false },
      { key: "strongPasswords", label: "Strong Password Policies", mandatory: false },
      { key: "mfa", label: "Multi-Factor Authentication (MFA)", mandatory: false },
      { key: "accessReviews", label: "Access Reviews", mandatory: false },
      { key: "securityLogs", label: "Security Logs", mandatory: false },
      { key: "logAnalysis", label: "Log Analysis", mandatory: false },
      { key: "incidentResponse", label: "Incident Response Plan", mandatory: false },
      { key: "siem", label: "Security Information and Event Management (SIEM)", mandatory: false },
      { key: "penTesting", label: "Penetration Testing", mandatory: false },
      { key: "secureSdlc", label: "Secure Software Development Life Cycle (SDLC)", mandatory: false },
    ],
  },
];
