export interface IFormInput {
    name: string
    phone: string
    age: number
    gender: string
    address?: string
    date: Date
    time: string
    message?: string
    paymentMethod: string
    cashAmount: number
    onlineAmount: number
    discount: number
    serviceName: string
    doctor: string
    specialist?: string
    referredBy?: string
    appointmentType: "oncall" | "visithospital"
    opdType: "opd"
    modality: string
    visitType?: "first" | "followup"
    study?: string
  }
  
  export interface PatientRecord {
    id: string
    name: string
    phone: string
    age?: number
    gender?: string
    address?: string
    createdAt?: string
    uhid?: string
  }
  
  export interface Doctor {
    id: string
    name: string
    specialist: string[]
    department: string
    firstVisitCharge: number
    followUpCharge: number
    ipdCharges?: {
      casualty: number
      delux: number
      female: number
      icu: number
      male: number
      nicu: number
      suit: number
    }
  }
  
  export interface OnCallAppointment {
    id: string
    name: string
    phone: string
    age: number
    gender: string
    date: string
    time: string
    doctor?: string
    serviceName?: string
    appointmentType: "oncall"
    createdAt: string
    opdType: "opd"
    modality?: string
    visitType?: string
    study?: string
  }
  
  export const PaymentOptions = [
    { value: "cash", label: "Cash" },
    { value: "online", label: "Online" },
    { value: "mixed", label: "Cash + Online" },
  ]
  
  export const GenderOptions = [
    { value: "male", label: "Male" },
    { value: "female", label: "Female" },
    { value: "other", label: "Other" },
  ]
  
  export const ModalityOptions = [
    { value: "consultation", label: "Consultation" },
    { value: "casualty", label: "Casualty" },
    { value: "xray", label: "X-Ray" },
    { value: "pathology", label: "Pathology" },
  ]
  
  export const VisitTypeOptions = [
    { value: "first", label: "First Visit" },
    { value: "followup", label: "Follow Up" },
  ]
  
  export const XRayStudyOptions = [
    "CHEST PA",
    "CHEST AP,PA,LAT,OBL",
    "ABDOMEN AP",
    "SKULL AP/LAT",
    "MASTOID",
    "ADENOID",
    "NASAL BONE",
    "NASOPHRANX",
    "TM JOINT LAT",
    "TM JOINT AP/LAT",
    "CERVICA SPINE AP/LAT",
    "DORSAL SPINE AP/LAT",
    "LUMBAR SPINE AP/LAT",
    "LUMBAR SPINE FLX/EXT",
    "SACRUM-COCCYX AP/LAT",
    "PBH-AP",
    "PBH AP/LAT",
    "PBH AP/LAT VIEW (BOTH LAT)",
    "FEMUR AP/LAT",
    "BOTH FEMUR AP/LAT",
    "KNEE JOINT AP/LAT",
    "BOTH KNEE JOINT AP/LAT",
    "LEG AP/LAT",
    "BOTH LEG AP/LAT",
    "ANKLE AP/LAT",
    "BOTH ANKLE AP/LAT",
    "FOOT AP/LAT",
    "BOTH FOOT AP/LAT",
    "TOE AP/LAT",
    "HAND AP/LAT",
    "ELBOW AP/LAT",
    "FOREARM AP/LAT",
    "FINGER AP/LAT",
    "KUB",
    "PNS",
    "PNS (CALDWELL / WATERS)",
    "HSG",
    "IVP",
    "BMFT",
    "BM SWALLOW",
    "IgE LEVEL",
    "2D ECHO OPD with Consultation",
    "2D ECHO IPD with Consultation",
    "2D ECHO OPD without Consultation",
    "2D ECHO IPD without Consultation",
  ]
  
  export const PathologyStudyOptions = [
    "Absolute Eosinophils count blood",
    "Acid Phosphatase total Serum",
    "ALBUMIN 24 HRS URINE",
    "ALBUMIN",
    "Albumin or Creatinine Ratio",
    "ALKALINE PO4",
    "Alfa Feto Protein Serum",
    "AMYLASE",
    "ANA ELISA",
    "Anti Cardiolipin IgG",
    "Anti Cardiolipin IgM",
    "Anti ds DNA",
    "Anti D Titre Rh Titre",
    "HBsAg Vidas",
    "Australia Antigen",
    "BETA HCG (LMP REQUIRE)",
    "Bile salt and pigments urine qualitative",
    "BILIRUBIN",
    "PAP",
    "BT and CT",
    "BUN",
    "CA 125",
    "CALCIUM",
    "COMPLETE BLOOD COUNT (HAEMOGRAM) CBC",
    "CHOLESTEROL",
    "Cholesterol LDL Direct",
    "CK MB",
    "CMV IgG",
    "CMV IgM",
    "Coombs Direct",
    "Coombs Indirect",
    "CPK",
    "CREATININ",
    "CRP (C-Reactive Protein)",
    "Dengue IgG",
    "Dengue IgM",
    "ELECTROLYTES",
    "Electrolytes Urine",
    "ESR",
    "Faeces Examination",
    "FDP D Dimer",
    "Fibrinogen",
    "Free T3",
    "Free T4",
    "Free T3 or Free T4 or TSH",
    "G6PD Qualitative",
    "G6PD Quantitative",
    "Glucose Fasting",
    "Glycosylated Haemoglobin",
    "GTT 3 Readings",
    "Haemoglobin and PCV",
    "HBc Total Antibody",
    "HBc IgM Antibody",
    "HBe Antibody",
    "HBeAg",
    "HBsAg Antibody",
    "HBV DNA Quantitative Viral Load",
    "HBV DNA Qualitative",
    "HDL Cholesterol",
    "HIV IandII",
    "Malarial Antibody",
    "Malaria Antigen",
    "MP (Malarial Parasite)",
    "PAP Smear",
    "Peripheral Smear Examination",
    "Platelet Count",
    "Potassium",
    "PREGNANCY TEST",
    "PROLACTIN",
    "PSA",
    "RA Test",
    "RBC",
    "Reticulocyte Count",
    "Rh Antibody Titre",
    "SEMEN",
    "SGOT",
    "SGPT",
    "Sodium",
    "Sputum Routine Comprehensive",
    "Stool Occult blood",
    "Sugar urine",
    "T3 T4 TSH",
    "T3",
    "T4",
    "Thyroid Antibodies ATAB",
    "TIBC Direct",
    "Torch 4 IgG Toxoplasma CMV Rubella HSV 2",
    "Torch 8 IgG or IgM Toxoplasma CMV Rubella HSV 2",
    "Triple Test I Trimester (8-13 WEEKS)",
    "Triple Test II Trimester (14-22 WEEKS)",
    "Urea",
    "Urea Clearance Test",
    "URIC ACID",
    "URINE ROUTINE",
    "VDRL",
    "VITAMIN B12",
    "VITAMIN D3",
    "Western Blot Test",
    "WIDAL TEST",
    "IRON",
    "FERRITIN",
    "ANA Immunofluorescence",
    "LDH",
    "Acid phosphatase With prostatic fraction",
    "Ammonia",
    "Apolipoproteins A1 and B",
    "Anti Thrombin Antigen",
    "Beta 2 Microglobulin",
    "BICARBONATE",
    "BLOOD C/S",
    "Blood Group",
    "C peptide",
    "CA15.3",
    "CA19.9",
    "Calcitonin",
    "CEA",
    "CORTISOL",
    "Culture and susceptibity",
    "Deoxypyridinoline Urine",
    "E2",
    "Folic Acid",
    "Free PSA",
    "Free PSA : PSA ratio",
    "FSH",
    "GGT",
    "HB ELECTRO",
    "HOMOCYSTEINE",
    "HS-CRP",
    "INSULIN FASTING",
    "LDL Cholesterol",
    "Luteinizing Hormone",
    "Lipoprotein A",
    "Micro Albumin",
    "Osmolarity",
    "Osteocalcin",
    "PHOSPHORUS",
    "Post Prandial Sugar",
    "PROTEIN ELECTRO",
    "Proteins",
    "ParaThyroid Hormone",
    "Testosterone",
    "Thyroglobulin",
    "Thyroid peoxidase Antibody",
    "TOTAL PROTEIN",
    "TRIGLYCERIDES",
    "Thyroid Stimulating Hormone",
    "Urine Magnesium",
    "Chlorides",
    "TESTOSTERONE FREE",
    "Alkaline Phosphatase with bone fraction",
    "VLDL Cholesterol",
    "Urine PH",
    "Urine Citrate",
    "HDL Cholesterol Ratio",
    "Albumin / Globulin Ratio",
    "KFT",
    "Haemoglobin",
    "HAEMOGRAM",
    "HBA1C - Glycated Haemoglobin",
    "PROTH TIME (NA CI)",
    "PTT (NA CITRATE)",
    "MALARIAL ANTIGEN",
    "BTCT",
    "Peripheral Smear with GBP",
    "HB (Haemoglobin)",
    "HIV",
    "HCV",
    "ASO",
    "THYPHI IGG IGM",
    "DENGUE NS1",
    "DENGUE IGG/IGM",
    "DENGUE PROFILE",
    "BLOOD SUGAR FASTING",
    "BLOOD SUGAR PP",
    "BLOOD SUGAR RANDOM",
    "OGTT",
    "BLOOD URINE",
    "RA FACTOR",
    "CPK MB",
    "PHERIPHERAL SMEAR",
    "STOOL ROUTINE",
    "MANTOUX TEST",
    "LIPID PROFILE",
    "RENAL PROFILE",
    "ANC PROFILE",
    "FEVER PROFILE",
    "ANC+TSH",
    "SPUTUM AFB ROUTINE",
    "URINE C/S",
    "STOOL C/S",
    "SPUTUM C/S",
    "AFB CULTURE ALL SAMPLE",
    "PUS C/S",
    "ALBUMIN SPOT URINE",
    "APTT",
    "ADA",
    "AMH",
    "AMO (TPO)",
    "ANAEMIA PROFILE (MINI)",
    "ANA (IFA)",
    "ALPHA FETO PROTEIN",
    "ANTI HCV",
    "ANTI CCP",
    "FASTING C PEPTIDE",
    "C3 LEVEL",
    "CHIKUNGUNIYA IGM",
    "CD3/CD4/CD8/CD45",
    "FSH/LH/PROLC/TSH",
    "FSH LH PROLACTIN TESTES",
    "VITAMIN D13",
    "TSH",
    "HLAB27",
    "HAV IgG",
    "HAVIgM",
    "HEVIgM",
    "IRON STUDIES",
    "PTH",
    "LH",
    "PSA TOTAL",
    "TESTOSTERONE TOTAL",
    "TBGOLD",
    "TORCH 8",
    "TPHA",
    "TRIPLE MARKER(18- 13 WEEK)",
    "HEV IgG",
    "TRIPLE MARKER(14- 22 WEEK)",
    "VITAMIN D3 PLUS",
    "FSH/LH/PROLACTIN",
    "IL-6",
    "HIV DUO ELISA",
    "HIV 1/2",
    "MP",
    "SPUTUM FOR AFB/1 SAMPLE",
    "IgE LEVEL",
    "LIVER FUNCTION TEST",
    "THYROID FUNCTION TEST",
    "CARDIAC PANEL TEST",
    "HEMATOLOGY",
    "DENGUE IgG AND IgM WITH NS1",
    "TYPHOID IGG AND IGM",
    "COMPLETE BLOOD COUNT WITH ESR AND MALARIAL PARASITE",
    "URINE ROUTINE EXAMINATION",
    "BLOOD GLUCOSE RANDOM",
    "COMPLETE BLOOD COUNT WITH ESR & MALARIAL PARASITE",
    "V.D.R.L TEST",
    "BIOCHEMISTRY",
    "HBsAg (ANC Elisa)",
    "HBsAg (Elisa)",
    "PROTHROMBIN TIME ESTIMATION",
    "STOOL REPORT",
    "BLOOD UREA",
    "PRO BNP",
    "ABG",
    "FNAC",
    "MAGNESIUM",
    "HLAB27 PCR",
    "CREATININE",
    "IL6",
    "VIT B6",
    "HIV I & II (WESTERN BLOOD)",
    "TROP I",
    "TROP T",
    "BODY PROFILE",
    "3 H",
    "BLOOD SUGAR FBS PPBS",
    "HISTOPATH - Small Sample",
    "HISTOPATH - Medium Sample",
    "HISTOPATH - Large Sample",
    "LIPASE"
  ]
  