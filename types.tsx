export interface Casualty {
  id: string
  name: string
  age: number
  gender: string
  phoneNumber: string
  address: string
  chiefComplaint: string
  diagnosis: string
  treatmentPlan: string
  services: Service[]
  vitalSigns: VitalSigns
  dateOfBirth?: string
}

export interface Service {
  id: string
  name: string
  amount: number
  discount?: number
}

interface VitalSigns {
  pulse: number
  temperature: number
  oxygenSaturation: number
  respiratoryRate: number
  gcs: number
}
