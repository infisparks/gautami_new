"use client"

import type React from "react"
import { useEffect, useRef } from "react"
import { type UseFormReturn, Controller } from "react-hook-form"
import {
  type IFormInput,
  type PatientRecord,
  GenderOptions,
  ModalityOptions,
  VisitTypeOptions,
  XRayStudyOptions,
  PathologyStudyOptions,
  PaymentOptions,
} from "./types"
import {
  Phone,
  Cake,
  MapPin,
  Clock,
  MessageSquare,
  IndianRupeeIcon,
  PersonStandingIcon as PersonIcon,
  CalendarIcon,
  Stethoscope,
} from "lucide-react"
import DatePicker from "react-datepicker"
import "react-datepicker/dist/react-datepicker.css"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import type { Doctor } from "./types"

interface PatientFormProps {
  form: UseFormReturn<IFormInput>
  doctors: Doctor[]
  patientSuggestions: PatientRecord[]
  phoneSuggestions: PatientRecord[]
  showNameSuggestions: boolean
  showPhoneSuggestions: boolean
  selectedPatient: PatientRecord | null
  onPatientSelect: (patient: PatientRecord) => void
  onNameChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onPhoneChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  setShowNameSuggestions: (show: boolean) => void
  setShowPhoneSuggestions: (show: boolean) => void
}

function formatAMPM(date: Date): string {
  let hours = date.getHours()
  let minutes: string | number = date.getMinutes()
  const ampm = hours >= 12 ? "PM" : "AM"
  hours = hours % 12
  hours = hours ? hours : 12
  minutes = minutes < 10 ? "0" + minutes : minutes
  return `${hours}:${minutes} ${ampm}`
}

export function PatientForm({
  form,
  doctors,
  patientSuggestions,
  phoneSuggestions,
  showNameSuggestions,
  showPhoneSuggestions,
  selectedPatient,
  onPatientSelect,
  onNameChange,
  onPhoneChange,
  setShowNameSuggestions,
  setShowPhoneSuggestions,
}: PatientFormProps) {
  const {
    register,
    control,
    formState: { errors },
    watch,
    setValue,
  } = form

  const nameInputRef = useRef<HTMLInputElement | null>(null)
  const phoneInputRef = useRef<HTMLInputElement | null>(null)
  const ageInputRef = useRef<HTMLInputElement | null>(null)
  const nameSuggestionBoxRef = useRef<HTMLDivElement | null>(null)
  const phoneSuggestionBoxRef = useRef<HTMLDivElement | null>(null)

  const watchedModality = watch("modality")
  const watchedSpecialist = watch("specialist")
  const watchedDoctor = watch("doctor")
  const watchedVisitType = watch("visitType")
  const watchedPaymentMethod = watch("paymentMethod")
  const watchedAppointmentType = watch("appointmentType")
  const watchedCashAmount = watch("cashAmount")
  const watchedOnlineAmount = watch("onlineAmount")

  // Get unique specialists from all doctors
  const getAvailableSpecialists = () => {
    const specialistSet = new Set<string>()
    doctors.forEach((doctor) => {
      if (doctor.specialist && Array.isArray(doctor.specialist)) {
        doctor.specialist.forEach((spec) => specialistSet.add(spec))
      }
    })
    return Array.from(specialistSet).sort()
  }

  // Filter doctors by selected specialist
  const getFilteredDoctors = () => {
    if (!watchedSpecialist || watchedModality !== "consultation") {
      return doctors.filter((d) => d.id !== "no_doctor")
    }

    return doctors.filter(
      (doctor) =>
        doctor.id !== "no_doctor" &&
        doctor.specialist &&
        Array.isArray(doctor.specialist) &&
        doctor.specialist.includes(watchedSpecialist),
    )
  }

  // Get current doctor charges
  const getCurrentDoctorCharges = () => {
    if (watchedModality === "consultation" && watchedDoctor && watchedVisitType) {
      const selectedDoctor = doctors.find((d) => d.id === watchedDoctor)
      if (selectedDoctor) {
        return watchedVisitType === "first" ? selectedDoctor.firstVisitCharge : selectedDoctor.followUpCharge
      }
    }
    return 0
  }

  // Reset dependent fields when modality changes
  useEffect(() => {
    if (watchedModality !== "consultation") {
      setValue("specialist", "")
      setValue("doctor", "")
      setValue("visitType", undefined)
    }
  }, [watchedModality, setValue])

  // Reset doctor and visit type when specialist changes
  useEffect(() => {
    if (watchedModality === "consultation") {
      setValue("doctor", "")
      setValue("visitType", undefined)
    }
  }, [watchedSpecialist, watchedModality, setValue])

  // Reset visit type when doctor changes and set default to "first"
  useEffect(() => {
    if (watchedModality === "consultation" && watchedDoctor) {
      setValue("visitType", "first")
    } else if (watchedModality === "consultation") {
      setValue("visitType", undefined)
    }
  }, [watchedDoctor, watchedModality, setValue])

  // Set default payment method to cash when appointment type is visithospital
  useEffect(() => {
    if (watchedAppointmentType === "visithospital" && !watchedPaymentMethod) {
      setValue("paymentMethod", "cash")
    }
  }, [watchedAppointmentType, watchedPaymentMethod, setValue])

  // Initial payment setup when visit type is selected
  useEffect(() => {
    if (
      watchedModality === "consultation" &&
      watchedDoctor &&
      watchedVisitType &&
      watchedAppointmentType === "visithospital"
    ) {
      const doctorCharges = getCurrentDoctorCharges()

      // Set default payment method to cash if not already set
      if (!watchedPaymentMethod) {
        setValue("paymentMethod", "cash")
      }

      // When visit type is first selected: cash amount = doctor charges, discount = 0
      if (watchedCashAmount === undefined && watchedOnlineAmount === undefined) {
        setValue("cashAmount", doctorCharges)
        setValue("onlineAmount", 0)
        setValue("discount", 0)
      }
    }
  }, [
    watchedModality,
    watchedDoctor,
    watchedVisitType,
    watchedAppointmentType,
    watchedPaymentMethod,
    watchedCashAmount,
    watchedOnlineAmount,
    setValue,
  ])

  // Real-time discount calculation for cash payment
  useEffect(() => {
    if (
      watchedModality === "consultation" &&
      watchedDoctor &&
      watchedVisitType &&
      watchedPaymentMethod === "cash" &&
      watchedCashAmount !== undefined
    ) {
      const doctorCharges = getCurrentDoctorCharges()
      const cashAmount = Number(watchedCashAmount) || 0

      if (cashAmount < doctorCharges) {
        const autoDiscount = doctorCharges - cashAmount
        setValue("discount", autoDiscount)
      } else {
        setValue("discount", 0)
      }
    }
  }, [watchedModality, watchedDoctor, watchedVisitType, watchedPaymentMethod, watchedCashAmount, setValue])

  // Real-time discount calculation for mixed payment
  useEffect(() => {
    if (
      watchedModality === "consultation" &&
      watchedDoctor &&
      watchedVisitType &&
      watchedPaymentMethod === "mixed" &&
      (watchedCashAmount !== undefined || watchedOnlineAmount !== undefined)
    ) {
      const doctorCharges = getCurrentDoctorCharges()
      const cashAmount = Number(watchedCashAmount) || 0
      const onlineAmount = Number(watchedOnlineAmount) || 0
      const totalPaid = cashAmount + onlineAmount

      if (totalPaid < doctorCharges) {
        const autoDiscount = doctorCharges - totalPaid
        setValue("discount", autoDiscount)
      } else {
        setValue("discount", 0)
      }
    }
  }, [
    watchedModality,
    watchedDoctor,
    watchedVisitType,
    watchedPaymentMethod,
    watchedCashAmount,
    watchedOnlineAmount,
    setValue,
  ])

  // Real-time discount calculation for online payment
  useEffect(() => {
    if (
      watchedModality === "consultation" &&
      watchedDoctor &&
      watchedVisitType &&
      watchedPaymentMethod === "online" &&
      watchedOnlineAmount !== undefined
    ) {
      const doctorCharges = getCurrentDoctorCharges()
      const onlineAmount = Number(watchedOnlineAmount) || 0

      if (onlineAmount < doctorCharges) {
        const autoDiscount = doctorCharges - onlineAmount
        setValue("discount", autoDiscount)
      } else {
        setValue("discount", 0)
      }
    }
  }, [watchedModality, watchedDoctor, watchedVisitType, watchedPaymentMethod, watchedOnlineAmount, setValue])

  // Hide suggestions on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        showNameSuggestions &&
        nameSuggestionBoxRef.current &&
        !nameSuggestionBoxRef.current.contains(event.target as Node) &&
        nameInputRef.current &&
        !nameInputRef.current.contains(event.target as Node)
      ) {
        setShowNameSuggestions(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [showNameSuggestions, setShowNameSuggestions])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        showPhoneSuggestions &&
        phoneSuggestionBoxRef.current &&
        !phoneSuggestionBoxRef.current.contains(event.target as Node) &&
        phoneInputRef.current &&
        !phoneInputRef.current.contains(event.target as Node)
      ) {
        setShowPhoneSuggestions(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [showPhoneSuggestions, setShowPhoneSuggestions])

  const calculateTotalAmount = () => {
    const cashAmount = Number(watch("cashAmount")) || 0
    const onlineAmount = Number(watch("onlineAmount")) || 0
    const discount = Number(watch("discount")) || 0
    return cashAmount + onlineAmount - discount
  }

  const availableSpecialists = getAvailableSpecialists()
  const filteredDoctors = getFilteredDoctors()
  const currentDoctorCharges = getCurrentDoctorCharges()

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Patient Name Field with Auto-Suggest */}
        <div className="space-y-2" data-tour="patient-name">
          <Label htmlFor="name" className="text-sm font-medium">
            Patient Name <span className="text-red-500">*</span>
          </Label>
          <div className="relative">
            <PersonIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
            <Input
              id="name"
              type="text"
              {...register("name", { required: "Name is required" })}
              onChange={onNameChange}
              placeholder="Enter patient name"
              className={`pl-10 ${errors.name ? "border-red-500" : ""}`}
              autoComplete="off"
              ref={(e) => {
                register("name", { required: "Name is required" }).ref(e)
                nameInputRef.current = e
              }}
            />
            {showNameSuggestions && patientSuggestions.length > 0 && (
              <div
                ref={nameSuggestionBoxRef}
                className="absolute z-10 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md w-full mt-1 max-h-48 shadow-lg"
              >
                <ScrollArea className="max-h-48">
                  <div className="p-1">
                    {patientSuggestions.map((suggestion) => (
                      <div
                        key={suggestion.id}
                        className="flex items-center justify-between px-3 py-2 hover:bg-emerald-50 dark:hover:bg-gray-700 rounded-md cursor-pointer"
                        onClick={() => onPatientSelect(suggestion)}
                      >
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6">
                            <AvatarFallback className="text-xs bg-emerald-100 text-emerald-700">
                              {suggestion.name.substring(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-medium">{suggestion.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-500">{suggestion.phone || "No phone"}</span>
                          <Badge variant="default" className="text-xs">
                            Gautami
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}
          </div>
          {errors.name && <p className="text-sm text-red-500">{errors.name.message || "Name is required"}</p>}
        </div>

        {/* Phone Field with Auto-Suggest */}
        <div className="space-y-2" data-tour="phone">
          <Label htmlFor="phone" className="text-sm font-medium">
            Phone Number <span className="text-red-500">*</span>
          </Label>
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
            <Input
              id="phone"
              type="tel"
              {...register("phone", {
                required: "Phone number is required",
                pattern: {
                  value: /^[0-9]{10}$/,
                  message: "Please enter a valid 10-digit phone number",
                },
              })}
              onChange={onPhoneChange}
              placeholder="Enter 10-digit number"
              className={`pl-10 ${errors.phone ? "border-red-500" : ""}`}
              autoComplete="off"
              ref={(e) => {
                register("phone", {
                  required: "Phone number is required",
                  pattern: {
                    value: /^[0-9]{10}$/,
                    message: "Please enter a valid 10-digit phone number",
                  },
                }).ref(e)
                phoneInputRef.current = e
              }}
            />
            {showPhoneSuggestions && phoneSuggestions.length > 0 && (
              <div
                ref={phoneSuggestionBoxRef}
                className="absolute z-10 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md w-full mt-1 max-h-48 overflow-auto shadow-lg"
              >
                {phoneSuggestions.map((suggestion) => (
                  <div
                    key={suggestion.id}
                    onClick={() => onPatientSelect(suggestion)}
                    className="flex items-center justify-between px-3 py-2 hover:bg-emerald-50 dark:hover:bg-gray-700 cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <Avatar className="h-6 w-6">
                        <AvatarFallback className="text-xs bg-emerald-100 text-emerald-700">
                          {suggestion.name.substring(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium">{suggestion.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-500">{suggestion.phone || "No phone"}</span>
                      <Badge variant="default" className="text-xs">
                        Gautami
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {errors.phone && <p className="text-sm text-red-500">{errors.phone.message || "Phone number is required"}</p>}
        </div>

        {/* Age Field */}
        <div className="space-y-2" data-tour="age">
          <Label htmlFor="age" className="text-sm font-medium">
            Age <span className="text-red-500">*</span>
          </Label>
          <div className="relative">
            <Cake className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
            <Input
              id="age"
              type="number"
              {...register("age", {
                required: "Age is required",
                min: { value: 1, message: "Age must be positive" },
              })}
              placeholder="Enter age"
              className={`pl-10 ${errors.age ? "border-red-500" : ""}`}
              ref={(e) => {
                register("age", {
                  required: "Age is required",
                  min: { value: 1, message: "Age must be positive" },
                }).ref(e)
                ageInputRef.current = e
              }}
            />
          </div>
          {errors.age && <p className="text-sm text-red-500">{errors.age.message}</p>}
        </div>

        {/* Gender Field */}
        <div className="space-y-2" data-tour="gender">
          <Label htmlFor="gender" className="text-sm font-medium">
            Gender <span className="text-red-500">*</span>
          </Label>
          <Controller
            control={control}
            name="gender"
            rules={{ required: "Gender is required" }}
            render={({ field }) => (
              <Select onValueChange={field.onChange} value={field.value}>
                <SelectTrigger className={errors.gender ? "border-red-500" : ""}>
                  <SelectValue placeholder="Select gender" />
                </SelectTrigger>
                <SelectContent>
                  {GenderOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {errors.gender && <p className="text-sm text-red-500">{errors.gender.message}</p>}
        </div>

        {/* Appointment Type Selection */}
        <div className="space-y-2 col-span-2">
          <Label htmlFor="appointmentType" className="text-sm font-medium">
            Appointment Type <span className="text-red-500">*</span>
          </Label>
          <div className="grid grid-cols-2 gap-4">
            <div
              className={`border rounded-md p-3 cursor-pointer transition-colors ${
                watch("appointmentType") === "visithospital"
                  ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20"
                  : "border-gray-200 dark:border-gray-700"
              }`}
              onClick={() => setValue("appointmentType", "visithospital")}
            >
              <div className="flex items-center gap-2">
                <div
                  className={`h-4 w-4 rounded-full border ${
                    watch("appointmentType") === "visithospital"
                      ? "border-emerald-500 bg-emerald-500"
                      : "border-gray-300"
                  }`}
                ></div>
                <span className="font-medium">Visit Hospital</span>
              </div>
              <p className="text-xs text-gray-500 mt-1 ml-6">Patient will visit the hospital in person</p>
            </div>
            <div
              className={`border rounded-md p-3 cursor-pointer transition-colors ${
                watch("appointmentType") === "oncall"
                  ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20"
                  : "border-gray-200 dark:border-gray-700"
              }`}
              onClick={() => setValue("appointmentType", "oncall")}
            >
              <div className="flex items-center gap-2">
                <div
                  className={`h-4 w-4 rounded-full border ${
                    watch("appointmentType") === "oncall" ? "border-emerald-500 bg-emerald-500" : "border-gray-300"
                  }`}
                ></div>
                <span className="font-medium">On-Call</span>
              </div>
              <p className="text-xs text-gray-500 mt-1 ml-6">Remote consultation via phone</p>
            </div>
          </div>
        </div>

        {/* Modality Selection */}
        <div className="space-y-2" data-tour="modality">
          <Label htmlFor="modality" className="text-sm font-medium">
            Modality <span className="text-red-500">*</span>
          </Label>
          <Controller
            control={control}
            name="modality"
            rules={{ required: "Modality is required" }}
            render={({ field }) => (
              <Select onValueChange={field.onChange} value={field.value}>
                <SelectTrigger className={errors.modality ? "border-red-500" : ""}>
                  <SelectValue placeholder="Select modality" />
                </SelectTrigger>
                <SelectContent>
                  {ModalityOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {errors.modality && <p className="text-sm text-red-500">{errors.modality.message}</p>}
        </div>

        {/* Conditional fields based on modality */}
        {watchedModality === "consultation" && (
          <>
            {/* Specialist Selection */}
            <div className="space-y-2" data-tour="specialist">
              <Label htmlFor="specialist" className="text-sm font-medium">
                Specialist <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <Stethoscope className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                <Controller
                  control={control}
                  name="specialist"
                  rules={{
                    required: watchedModality === "consultation" ? "Specialist selection is required" : false,
                  }}
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger className={`pl-10 ${errors.specialist ? "border-red-500" : ""}`}>
                        <SelectValue placeholder="Select specialist" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableSpecialists.map((specialist) => (
                          <SelectItem key={specialist} value={specialist}>
                            {specialist}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              {errors.specialist && <p className="text-sm text-red-500">{errors.specialist.message}</p>}
            </div>

            {/* Doctor Selection - Only show if specialist is selected */}
            {watchedSpecialist && (
              <div className="space-y-2" data-tour="doctor">
                <Label htmlFor="doctor" className="text-sm font-medium">
                  Doctor <span className="text-red-500">*</span>
                </Label>
                <Controller
                  control={control}
                  name="doctor"
                  rules={{
                    required:
                      watchedModality === "consultation" && watchedSpecialist ? "Doctor selection is required" : false,
                  }}
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger className={errors.doctor ? "border-red-500" : ""}>
                        <SelectValue placeholder="Select doctor" />
                      </SelectTrigger>
                      <SelectContent>
                        {filteredDoctors.map((doctor) => (
                          <SelectItem key={doctor.id} value={doctor.id}>
                            {doctor.name} ({doctor.department})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.doctor && <p className="text-sm text-red-500">{errors.doctor.message}</p>}
                {filteredDoctors.length === 0 && watchedSpecialist && (
                  <p className="text-sm text-amber-600">No doctors available for selected specialist</p>
                )}
              </div>
            )}

            {/* Visit Type Selection - Only show if doctor is selected */}
            {watchedDoctor && (
              <div className="space-y-2">
                <Label htmlFor="visitType" className="text-sm font-medium">
                  Visit Type <span className="text-red-500">*</span>
                </Label>
                <Controller
                  control={control}
                  name="visitType"
                  rules={{
                    required: watchedModality === "consultation" && watchedDoctor ? "Visit type is required" : false,
                  }}
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value || ""}>
                      <SelectTrigger className={errors.visitType ? "border-red-500" : ""}>
                        <SelectValue placeholder="Select visit type" />
                      </SelectTrigger>
                      <SelectContent>
                        {VisitTypeOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                            {watchedDoctor &&
                              (() => {
                                const selectedDoctor = doctors.find((d) => d.id === watchedDoctor)
                                if (selectedDoctor) {
                                  const charge =
                                    option.value === "first"
                                      ? selectedDoctor.firstVisitCharge
                                      : selectedDoctor.followUpCharge
                                  return ` - ₹${charge}`
                                }
                                return ""
                              })()}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.visitType && <p className="text-sm text-red-500">{errors.visitType.message}</p>}
              </div>
            )}

            {/* Doctor Charges Display - Non-editable */}
            {watchedDoctor && watchedVisitType && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Doctor Charges</Label>
                <div className="relative">
                  <IndianRupeeIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                  <Input
                    value={currentDoctorCharges}
                    readOnly
                    className="pl-10 bg-gray-50 dark:bg-gray-800 cursor-not-allowed"
                    placeholder="Doctor charges"
                  />
                </div>
                <p className="text-xs text-gray-500">This amount is set by the doctor and cannot be edited</p>
              </div>
            )}
          </>
        )}

        {watchedModality === "casualty" && (
          <div className="space-y-2">
            <Label htmlFor="study" className="text-sm font-medium">
              Study <span className="text-red-500">*</span>
            </Label>
            <Input
              {...register("study", {
                required: watchedModality === "casualty" ? "Study is required" : false,
              })}
              placeholder="Enter study details"
              className={errors.study ? "border-red-500" : ""}
            />
            {errors.study && <p className="text-sm text-red-500">{errors.study.message}</p>}
          </div>
        )}

        {watchedModality === "xray" && (
          <div className="space-y-2">
            <Label htmlFor="study" className="text-sm font-medium">
              Study <span className="text-red-500">*</span>
            </Label>
            <Controller
              control={control}
              name="study"
              rules={{
                required: watchedModality === "xray" ? "Study selection is required" : false,
              }}
              render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger className={errors.study ? "border-red-500" : ""}>
                    <SelectValue placeholder="Select X-Ray study" />
                  </SelectTrigger>
                  <SelectContent>
                    {XRayStudyOptions.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.study && <p className="text-sm text-red-500">{errors.study.message}</p>}
          </div>
        )}

        {watchedModality === "pathology" && (
          <div className="space-y-2">
            <Label htmlFor="study" className="text-sm font-medium">
              Pathology Test <span className="text-red-500">*</span>
            </Label>
            <Controller
              control={control}
              name="study"
              rules={{
                required: watchedModality === "pathology" ? "Pathology test selection is required" : false,
              }}
              render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger className={errors.study ? "border-red-500" : ""}>
                    <SelectValue placeholder="Select pathology test" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {PathologyStudyOptions.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.study && <p className="text-sm text-red-500">{errors.study.message}</p>}
          </div>
        )}

        {/* Referred By Field */}
        <div className="space-y-2">
          <Label htmlFor="referredBy" className="text-sm font-medium">
            Referred By
          </Label>
          <Input id="referredBy" type="text" {...register("referredBy")} placeholder="Enter referrer name (optional)" />
        </div>

        {/* Date Field */}
        <div className="space-y-2" data-tour="date">
          <Label htmlFor="date" className="text-sm font-medium">
            Appointment Date <span className="text-red-500">*</span>
          </Label>
          <div className="relative">
            <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
            <Controller
              control={control}
              name="date"
              rules={{ required: "Date is required" }}
              render={({ field }) => (
                <DatePicker
                  selected={field.value}
                  onChange={(date: Date | null) => date && field.onChange(date)}
                  dateFormat="dd/MM/yyyy"
                  placeholderText="Select Date"
                  className={`w-full pl-10 pr-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500 border-gray-300 dark:border-gray-600 dark:bg-gray-800 ${
                    errors.date ? "border-red-500" : ""
                  }`}
                />
              )}
            />
          </div>
          {errors.date && <p className="text-sm text-red-500">{errors.date.message}</p>}
        </div>

        {/* Time Field */}
        <div className="space-y-2" data-tour="time">
          <Label htmlFor="time" className="text-sm font-medium">
            Appointment Time <span className="text-red-500">*</span>
          </Label>
          <div className="relative">
            <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
            <Input
              id="time"
              type="text"
              {...register("time", {
                required: "Time is required",
              })}
              placeholder="e.g. 10:30 AM"
              className={`pl-10 ${errors.time ? "border-red-500" : ""}`}
              defaultValue={formatAMPM(new Date())}
            />
          </div>
          {errors.time && <p className="text-sm text-red-500">{errors.time.message}</p>}
        </div>

        {/* Conditional fields for hospital visit */}
        {watchedAppointmentType === "visithospital" && (
          <>
            {/* Address Field */}
            <div className="space-y-2" data-tour="address">
              <Label htmlFor="address" className="text-sm font-medium">
                Address
              </Label>
              <div className="relative">
                <MapPin className="absolute left-3 top-3 h-4 w-4 text-gray-500" />
                <Textarea
                  id="address"
                  {...register("address")}
                  placeholder="Enter address (optional)"
                  className="pl-10 min-h-[80px]"
                />
              </div>
            </div>

            {/* Payment Method Field */}
            <div className="space-y-2" data-tour="paymentMethod">
              <Label htmlFor="paymentMethod" className="text-sm font-medium">
                Payment Method <span className="text-red-500">*</span>
              </Label>
              <Controller
                control={control}
                name="paymentMethod"
                rules={{
                  required: watchedAppointmentType === "visithospital" ? "Payment method is required" : false,
                }}
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value || "cash"}>
                    <SelectTrigger className={errors.paymentMethod ? "border-red-500" : ""}>
                      <SelectValue placeholder="Select payment method" />
                    </SelectTrigger>
                    <SelectContent>
                      {PaymentOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.paymentMethod && <p className="text-sm text-red-500">{errors.paymentMethod.message}</p>}
            </div>

            {/* Amount Fields */}
            {watchedPaymentMethod === "mixed" ? (
              <div className="col-span-2 grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="cashAmount" className="text-sm font-medium">
                    Cash Amount (Rs) <span className="text-red-500">*</span>
                  </Label>
                  <div className="relative">
                    <IndianRupeeIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                    <Input
                      id="cashAmount"
                      type="number"
                      placeholder="Enter cash amount received"
                      className={`pl-10 ${errors.cashAmount ? "border-red-500" : ""}`}
                      {...register("cashAmount", {
                        required: watchedPaymentMethod === "mixed" ? "Cash amount is required" : false,
                        min: { value: 0, message: "Amount must be positive" },
                        valueAsNumber: true,
                      })}
                      onWheel={(e) => {
                        e.preventDefault()
                        ;(e.currentTarget as HTMLElement).blur()
                      }}
                    />
                  </div>
                  {errors.cashAmount && <p className="text-sm text-red-500">{errors.cashAmount.message}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="onlineAmount" className="text-sm font-medium">
                    Online Amount (Rs) <span className="text-red-500">*</span>
                  </Label>
                  <div className="relative">
                    <IndianRupeeIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                    <Input
                      id="onlineAmount"
                      type="number"
                      placeholder="Enter online amount received"
                      className={`pl-10 ${errors.onlineAmount ? "border-red-500" : ""}`}
                      {...register("onlineAmount", {
                        required: watchedPaymentMethod === "mixed" ? "Online amount is required" : false,
                        min: { value: 0, message: "Amount must be positive" },
                        valueAsNumber: true,
                      })}
                      onWheel={(e) => {
                        e.preventDefault()
                        ;(e.currentTarget as HTMLElement).blur()
                      }}
                    />
                  </div>
                  {errors.onlineAmount && <p className="text-sm text-red-500">{errors.onlineAmount.message}</p>}
                </div>
              </div>
            ) : watchedPaymentMethod === "online" ? (
              <div className="space-y-2" data-tour="amount">
                <Label htmlFor="onlineAmount" className="text-sm font-medium">
                  Online Amount (Rs) <span className="text-red-500">*</span>
                </Label>
                <div className="relative">
                  <IndianRupeeIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                  <Input
                    id="onlineAmount"
                    type="number"
                    placeholder="Enter online amount received"
                    className={`pl-10 ${errors.onlineAmount ? "border-red-500" : ""}`}
                    {...register("onlineAmount", {
                      required: watchedPaymentMethod === "online" ? "Online amount is required" : false,
                      min: { value: 0, message: "Amount must be positive" },
                      valueAsNumber: true,
                    })}
                    onWheel={(e) => {
                      e.preventDefault()
                      ;(e.currentTarget as HTMLElement).blur()
                    }}
                  />
                </div>
                {errors.onlineAmount && <p className="text-sm text-red-500">{errors.onlineAmount.message}</p>}
              </div>
            ) : (
              <div className="space-y-2" data-tour="amount">
                <Label htmlFor="cashAmount" className="text-sm font-medium">
                  Cash Amount (Rs) <span className="text-red-500">*</span>
                </Label>
                <div className="relative">
                  <IndianRupeeIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                  <Input
                    id="cashAmount"
                    type="number"
                    placeholder="Enter cash amount received"
                    className={`pl-10 ${errors.cashAmount ? "border-red-500" : ""}`}
                    {...register("cashAmount", {
                      required: watchedAppointmentType === "visithospital" ? "Amount is required" : false,
                      min: { value: 0, message: "Amount must be positive" },
                      valueAsNumber: true,
                    })}
                    onWheel={(e) => {
                      e.preventDefault()
                      ;(e.currentTarget as HTMLElement).blur()
                    }}
                  />
                </div>
                {errors.cashAmount && <p className="text-sm text-red-500">{errors.cashAmount.message}</p>}
              </div>
            )}

            {/* Discount Field - Auto-calculated */}
            <div className="space-y-2" data-tour="discount">
              <Label htmlFor="discount" className="text-sm font-medium">
                Discount (Rs)
              </Label>
              <div className="relative">
                <IndianRupeeIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                <Input
                  id="discount"
                  type="number"
                  placeholder="Auto-calculated discount"
                  className="pl-10 bg-gray-50 dark:bg-gray-800"
                  {...register("discount", {
                    min: { value: 0, message: "Discount must be positive" },
                    valueAsNumber: true,
                  })}
                  readOnly
                  onWheel={(e) => {
                    e.preventDefault()
                    ;(e.currentTarget as HTMLElement).blur()
                  }}
                />
              </div>
              {errors.discount && <p className="text-sm text-red-500">{errors.discount.message}</p>}
              {currentDoctorCharges > 0 && (
                <div className="text-xs space-y-1">
                  <p className="text-gray-600">Doctor Charges: ₹{currentDoctorCharges}</p>
                  {watchedPaymentMethod === "mixed" && (
                    <p className="text-gray-600">
                      Total Paid: ₹{(Number(watchedCashAmount) || 0) + (Number(watchedOnlineAmount) || 0)}
                    </p>
                  )}
                  {watchedPaymentMethod === "cash" && (
                    <p className="text-gray-600">Cash Paid: ₹{Number(watchedCashAmount) || 0}</p>
                  )}
                  {watchedPaymentMethod === "online" && (
                    <p className="text-gray-600">Online Paid: ₹{Number(watchedOnlineAmount) || 0}</p>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {/* Message Field */}
        <div className="space-y-2 col-span-2" data-tour="message">
          <Label htmlFor="message" className="text-sm font-medium">
            Additional Notes
          </Label>
          <div className="relative">
            <MessageSquare className="absolute left-3 top-3 h-4 w-4 text-gray-500" />
            <Textarea
              id="message"
              {...register("message")}
              placeholder="Enter any additional notes (optional)"
              className="pl-10 min-h-[100px]"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
