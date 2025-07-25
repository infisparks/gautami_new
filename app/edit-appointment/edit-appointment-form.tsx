// app/edit-appointment/edit-appointment-form.tsx

"use client"

import { useEffect, useCallback, useMemo, useRef } from "react" // Added useRef
import { type UseFormReturn, Controller } from "react-hook-form"
import { type IFormInput, GenderOptions, PaymentOptions, AgeUnitOptions } from "../opd/types"
import { DoctorSearchDropdown } from "../opd/Component/doctor-search-dropdown" // Fixed import

import {
  Phone,
  Cake,
  MapPin,
  Clock,
  MessageSquare,
  IndianRupeeIcon,
  PersonStandingIcon as PersonIcon,
  CalendarIcon,
  User,
  CreditCard,
  FileText,
  Hospital,
  PhoneCall,
  Search, // Added Search icon import if used in PatientForm for UHID search
} from "lucide-react"

import DatePicker from "react-datepicker"
import "react-datepicker/dist/react-datepicker.css"

import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge" // Added Badge import
import { ScrollArea } from "@/components/ui/scroll-area" // Added ScrollArea import
import { Avatar, AvatarFallback } from "@/components/ui/avatar" // Added Avatar imports

import { ModalitySelector } from "../opd/modality-selector"
import { BillGenerator } from "./bill-generator" // This is the component that generates the PDF

import type { Doctor } from "../opd/types"

interface EditAppointmentFormProps {
  form: UseFormReturn<IFormInput>;
  doctors: Doctor[];
  appointmentId?: string;
  patientId?: string;
  billNumber?: string; // THIS IS THE CRUCIAL LINE
  // The following props are from PatientForm that might be copied over,
  // ensure they match if PatientForm is directly copied or re-used here.
  // For EditAppointmentForm, these are usually not needed as patient is already selected.
  // patientSuggestions?: PatientRecord[];
  // phoneSuggestions?: PatientRecord[];
  // uhidSearchInput?: string;
  // uhidSuggestions?: PatientRecord[];
  // showNameSuggestions?: boolean;
  // showPhoneSuggestions?: boolean;
  // showUhidSuggestions?: boolean;
  // selectedPatient?: PatientRecord | null;
  // onPatientSelect?: (patient: PatientRecord) => void;
  // onNameChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  // onPhoneChange?: (e.React.ChangeEvent<HTMLInputElement>) => void;
  // onUhidChange?: (e.React.ChangeEvent<HTMLInputElement>) => void;
  // setShowNameSuggestions?: (show: boolean) => void;
  // setShowPhoneSuggestions?: (show: boolean) => void;
  // setShowUhidSuggestions?: (show: boolean) => void;
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

export function EditAppointmentForm({ form, doctors, appointmentId, patientId, billNumber }: EditAppointmentFormProps) { // Destructure billNumber
  const {
    register,
    control,
    formState: { errors },
    watch,
    setValue,
  } = form

  const watchedModalities = watch("modalities") || []
  const watchedPaymentMethod = watch("paymentMethod")
  const watchedAppointmentType = watch("appointmentType")
  const watchedCashAmount = watch("cashAmount")
  const watchedOnlineAmount = watch("onlineAmount")

  // Get all form data for bill generation
  const formData = watch()

  // Calculate total charges
  const getTotalModalityCharges = useCallback(() => {
    return watchedModalities.reduce((total, modality) => total + modality.charges, 0)
  }, [watchedModalities])

  const totalModalityCharges = useMemo(() => getTotalModalityCharges(), [getTotalModalityCharges])

  // Payment logic
  useEffect(() => {
    if (watchedAppointmentType === "visithospital" && !watchedPaymentMethod) {
      setValue("paymentMethod", "cash")
    }
  }, [watchedAppointmentType, watchedPaymentMethod, setValue])

  useEffect(() => {
    if (
      watchedAppointmentType === "visithospital" &&
      watchedModalities.length > 0 &&
      watchedCashAmount === undefined &&
      watchedOnlineAmount === undefined
    ) {
      const totalCharges = totalModalityCharges
      setValue("cashAmount", totalCharges)
      setValue("onlineAmount", 0)
      setValue("discount", 0)
    }
  }, [watchedModalities.length, watchedAppointmentType, totalModalityCharges, setValue])

  // Fixed payment calculation logic
  // 1) Shift the total paid into the newly selected method
  useEffect(() => {
    if (watchedAppointmentType !== "visithospital") return

    // Sum whatever's currently entered
    const cash = Number(watch("cashAmount")) || 0
    const online = Number(watch("onlineAmount")) || 0
    const totalPaid = cash + online

    if (watchedPaymentMethod === "cash") {
      // Move all paid into cash, zero out online
      setValue("cashAmount", totalPaid)
      setValue("onlineAmount", 0)
    } else if (
      watchedPaymentMethod === "online" ||
      watchedPaymentMethod === "card-credit" ||
      watchedPaymentMethod === "card-debit"
    ) {
      // Move all paid into online, zero out cash
      setValue("onlineAmount", totalPaid)
      setValue("cashAmount", 0)
    }
  }, [watchedAppointmentType, watchedPaymentMethod, setValue, watch])

  // 2) Recalculate discount any time the paid amounts or total charges change
  useEffect(() => {
    if (watchedAppointmentType !== "visithospital") return

    const totalCharges = totalModalityCharges
    const cashAmount = Number(watchedCashAmount) || 0
    const onlineAmount = Number(watchedOnlineAmount) || 0
    const totalPaid = cashAmount + onlineAmount

    // Discount is whatever is left if paid < charges
    const discount = totalPaid < totalCharges ? totalCharges - totalPaid : 0

    // Only set it if it's actually different
    if (watch("discount") !== discount) {
      setValue("discount", discount)
    }
  }, [watchedAppointmentType, totalModalityCharges, watchedCashAmount, watchedOnlineAmount, setValue, watch])

  // Fixed calculation: Final amount = Cash + Online (total amount paid)
  const calculateTotalAmount = () => {
    const cashAmount = Number(watch("cashAmount")) || 0
    const onlineAmount = Number(watch("onlineAmount")) || 0
    return cashAmount + onlineAmount
  }

  return (
    <div className="space-y-6">
      {/* Patient Information Section */}
      <Card className="border-l-4 border-l-blue-500">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <User className="h-5 w-5 text-blue-600" />
            Patient Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {/* Patient Name */}
            <div className="space-y-2">
              <Label htmlFor="name" className="text-sm font-medium">
                Patient Name <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <PersonIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                <Input
                  id="name"
                  type="text"
                  {...register("name", { required: "Name is required" })}
                  placeholder="Enter patient name"
                  className={`pl-10 ${errors.name ? "border-red-500" : ""}`}
                  autoComplete="off"
                />
              </div>
              {errors.name && <p className="text-sm text-red-500">{errors.name.message}</p>}
            </div>
            {/* Phone */}
            <div className="space-y-2">
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
                  placeholder="Enter 10-digit number"
                  className={`pl-10 ${errors.phone ? "border-red-500" : ""}`}
                  autoComplete="off"
                />
              </div>
              {errors.phone && <p className="text-sm text-red-500">{errors.phone.message}</p>}
            </div>
            {/* Age */}
            <div className="space-y-2">
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
                    min: { value: 0, message: "Age must be positive" },
                    valueAsNumber: true,
                  })}
                  placeholder="Enter age"
                  className={`pl-10 ${errors.age ? "border-red-500" : ""}`}
                  onWheel={(e) => e.currentTarget.blur()}
                />
              </div>
              {errors.age && <p className="text-sm text-red-500">{errors.age.message}</p>}
            </div>
            {/* Age Unit - New Field */}
            <div className="space-y-2">
              <Label htmlFor="ageUnit" className="text-sm font-medium">
                Age Unit <span className="text-red-500">*</span>
              </Label>
              <Controller
                control={control}
                name="ageUnit"
                rules={{ required: "Age unit is required" }}
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger className={errors.ageUnit ? "border-red-500" : ""}>
                      <SelectValue placeholder="Select unit" />
                    </SelectTrigger>
                    <SelectContent>
                      {AgeUnitOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.ageUnit && <p className="text-sm text-red-500">{errors.ageUnit.message}</p>}
            </div>
            {/* Gender */}
            <div className="space-y-2">
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
          </div>
          {/* Consulting Doctor - New Field */}
          <div className="space-y-2">
            <Label htmlFor="doctor" className="text-sm font-medium">
              Consulting Doctor (Optional)
            </Label>
            <Controller
              control={control}
              name="doctor"
              render={({ field }) => (
                <DoctorSearchDropdown
                  doctors={doctors}
                  value={field.value || ""}
                  onSelect={field.onChange}
                  placeholder="Select consulting doctor"
                />
              )}
            />
            {errors.doctor && <p className="text-sm text-red-500">{errors.doctor.message}</p>}
          </div>
          {/* Appointment Type and Date/Time Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Appointment Type */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">
                Appointment Type <span className="text-red-500">*</span>
              </Label>
              <div className="grid grid-cols-2 gap-3">
                <div
                  className={`border rounded-lg p-3 cursor-pointer transition-all ${
                    watch("appointmentType") === "visithospital"
                      ? "border-blue-500 bg-blue-50 shadow-md"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                  onClick={() => setValue("appointmentType", "visithospital")}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={`h-3 w-3 rounded-full border-2 ${
                        watch("appointmentType") === "visithospital" ? "border-blue-500 bg-blue-500" : "border-gray-300"
                      }`}
                    ></div>
                    <Hospital className="h-4 w-4 text-blue-600" />
                    <span className="text-sm font-medium">Visit Hospital</span>
                  </div>
                </div>
                <div
                  className={`border rounded-lg p-3 cursor-pointer transition-all ${
                    watch("appointmentType") === "oncall"
                      ? "border-blue-500 bg-blue-50 shadow-md"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                  onClick={() => setValue("appointmentType", "oncall")}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={`h-3 w-3 rounded-full border-2 ${
                        watch("appointmentType") === "oncall" ? "border-blue-500 bg-blue-500" : "border-gray-300"
                      }`}
                    ></div>
                    <PhoneCall className="h-4 w-4 text-green-600" />
                    <span className="text-sm font-medium">On-Call</span>
                  </div>
                </div>
              </div>
            </div>
            {/* Date, Time, and Referred By */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="date" className="text-sm font-medium">
                  Date <span className="text-red-500">*</span>
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
                        className={`w-full pl-10 pr-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 border-gray-300 ${
                          errors.date ? "border-red-500" : ""
                        }`}
                      />
                    )}
                  />
                </div>
                {errors.date && <p className="text-sm text-red-500">{errors.date.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="time" className="text-sm font-medium">
                  Time <span className="text-red-500">*</span>
                </Label>
                <div className="relative">
                  <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                  <Input
                    id="time"
                    type="text"
                    {...register("time", { required: "Time is required" })}
                    placeholder="10:30 AM"
                    className={`pl-10 ${errors.time ? "border-red-500" : ""}`}
                    defaultValue={formatAMPM(new Date())}
                  />
                </div>
                {errors.time && <p className="text-sm text-red-500">{errors.time.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="referredBy" className="text-sm font-medium">
                  Referred By
                </Label>
                <Input id="referredBy" type="text" {...register("referredBy")} placeholder="Referrer name" />
              </div>
            </div>
          </div>
          {/* Address - Only for hospital visits */}
          {watchedAppointmentType === "visithospital" && (
            <div className="space-y-2">
              <Label htmlFor="address" className="text-sm font-medium">
                Address
              </Label>
              <div className="relative">
                <MapPin className="absolute left-3 top-3 h-4 w-4 text-gray-500" />
                <Textarea
                  id="address"
                  {...register("address")}
                  placeholder="Enter address (optional)"
                  className="pl-10 min-h-[60px]"
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      {/* Medical Services Section */}
      <Card className="border-l-4 border-l-green-500">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Hospital className="h-5 w-5 text-green-600" />
            Medical Services
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Controller
            control={control}
            name="modalities"
            rules={{
              required: "At least one service is required",
              validate: (modalities) => {
                if (!modalities || modalities.length === 0) {
                  return "At least one service is required"
                }
                for (const modality of modalities) {
                  if (modality.type === "consultation") {
                    if (!modality.specialist) return "Specialist is required for consultation"
                    if (!modality.doctor) return "Doctor is required for consultation"
                    if (!modality.visitType) return "Visit type is required for consultation"
                  }
                  if (
                    (modality.type === "casualty" ||
                      modality.type === "xray" ||
                      modality.type === "pathology" ||
                      modality.type === "ipd" ||
                      modality.type === "radiology" ||
                      modality.type === "cardiology") && // Added cardiology
                    !modality.service
                  ) {
                    return `Service is required for ${modality.type}`
                  }
                }
                return true
              },
            }}
            render={({ field }) => (
              <ModalitySelector modalities={field.value || []} doctors={doctors} onChange={field.onChange} />
            )}
          />
          {errors.modalities && <p className="text-sm text-red-500 mt-2">{errors.modalities.message}</p>}
        </CardContent>
      </Card>
      {/* Payment Section - Only for hospital visits */}
      {watchedAppointmentType === "visithospital" && (
        <Card className="border-l-4 border-l-purple-500">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <CreditCard className="h-5 w-5 text-purple-600" />
              Payment Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Payment Method */}
              <div className="space-y-2">
                <Label htmlFor="paymentMethod" className="text-sm font-medium">
                  Payment Method <span className="text-red-500">*</span>
                </Label>
                <Controller
                  control={control}
                  name="paymentMethod"
                  rules={{ required: "Payment method is required" }}
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value || "cash"}>
                      <SelectTrigger className={errors.paymentMethod ? "border-red-500" : ""}>
                        <SelectValue placeholder="Select method" />
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
              {/* Total Charges Display */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Total Charges</Label>
                <div className="relative">
                  <IndianRupeeIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                  <Input
                    value={totalModalityCharges}
                    readOnly
                    className="pl-10 bg-gray-50 cursor-not-allowed font-semibold text-blue-600"
                  />
                </div>
              </div>
              {/* Amount Fields */}
              {watchedPaymentMethod === "mixed" ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="cashAmount" className="text-sm font-medium">
                      Cash Amount <span className="text-red-500">*</span>
                    </Label>
                    <div className="relative">
                      <IndianRupeeIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                      <Input
                        id="cashAmount"
                        type="number"
                        placeholder="Cash amount"
                        className={`pl-10 ${errors.cashAmount ? "border-red-500" : ""}`}
                        {...register("cashAmount", {
                          required: "Cash amount is required",
                          min: { value: 0, message: "Amount must be positive" },
                          valueAsNumber: true,
                        })}
                        onWheel={(e) => e.currentTarget.blur()}
                      />
                    </div>
                    {errors.cashAmount && <p className="text-sm text-red-500">{errors.cashAmount.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="onlineAmount" className="text-sm font-medium">
                      Online Amount <span className="text-red-500">*</span>
                    </Label>
                    <div className="relative">
                      <IndianRupeeIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                      <Input
                        id="onlineAmount"
                        type="number"
                        placeholder="Online amount"
                        className={`pl-10 ${errors.onlineAmount ? "border-red-500" : ""}`}
                        {...register("onlineAmount", {
                          required: "Online amount is required",
                          min: { value: 0, message: "Amount must be positive" },
                          valueAsNumber: true,
                        })}
                        onWheel={(e) => e.currentTarget.blur()}
                      />
                    </div>
                    {errors.onlineAmount && <p className="text-sm text-red-500">{errors.onlineAmount.message}</p>}
                  </div>
                </>
              ) : watchedPaymentMethod === "online" ||
                watchedPaymentMethod === "card-credit" ||
                watchedPaymentMethod === "card-debit" ? (
                <div className="space-y-2">
                  <Label htmlFor="onlineAmount" className="text-sm font-medium">
                    {watchedPaymentMethod === "online" ? "Online Amount" : "Card Amount"}{" "}
                    <span className="text-red-500">*</span>
                  </Label>
                  <div className="relative">
                    <IndianRupeeIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                    <Input
                      id="onlineAmount"
                      type="number"
                      placeholder={watchedPaymentMethod === "online" ? "Online amount" : "Card amount"}
                      className={`pl-10 ${errors.onlineAmount ? "border-red-500" : ""}`}
                      {...register("onlineAmount", {
                        required: "Amount is required",
                        min: { value: 0, message: "Amount must be positive" },
                        valueAsNumber: true,
                      })}
                      onWheel={(e) => e.currentTarget.blur()}
                    />
                  </div>
                  {errors.onlineAmount && <p className="text-sm text-red-500">{errors.onlineAmount.message}</p>}
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="cashAmount" className="text-sm font-medium">
                    Cash Amount <span className="text-red-500">*</span>
                  </Label>
                  <div className="relative">
                    <IndianRupeeIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                    <Input
                      id="cashAmount"
                      type="number"
                      placeholder="Cash amount"
                      className={`pl-10 ${errors.cashAmount ? "border-red-500" : ""}`}
                      {...register("cashAmount", {
                        required: "Amount is required",
                        min: { value: 0, message: "Amount must be positive" },
                        valueAsNumber: true,
                      })}
                      onWheel={(e) => e.currentTarget.blur()}
                    />
                  </div>
                  {errors.cashAmount && <p className="text-sm text-red-500">{errors.cashAmount.message}</p>}
                </div>
              )}
              {/* Discount */}
              <div className="space-y-2">
                <Label htmlFor="discount" className="text-sm font-medium">
                  Discount
                </Label>
                <div className="relative">
                  <IndianRupeeIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                  <Input
                    id="discount"
                    type="number"
                    placeholder="Auto-calculated"
                    className="pl-10 bg-gray-50"
                    {...register("discount", {
                      min: { value: 0, message: "Discount must be positive" },
                      valueAsNumber: true,
                    })}
                    readOnly
                  />
                </div>
                {errors.discount && <p className="text-sm text-red-500">{errors.discount.message}</p>}
              </div>
            </div>
            {/* Payment Summary */}
            {totalModalityCharges > 0 && (
              <Card className="bg-gradient-to-r from-green-50 to-blue-50 border-green-200">
                <CardContent className="p-4">
                  <div className="flex justify-between items-center mb-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm flex-1">
                      <div className="flex justify-between">
                        <span>Total Charges:</span>
                        <span className="font-semibold">₹{totalModalityCharges}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Discount:</span>
                        <span className="text-red-600">-₹{Number(watch("discount")) || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Amount to Pay:</span>
                        <span className="font-semibold">
                          ₹{totalModalityCharges - (Number(watch("discount")) || 0)}
                        </span>
                      </div>
                      <div className="flex justify-between text-lg font-bold text-green-700">
                        <span>Amount Paid:</span>
                        <span>₹{calculateTotalAmount()}</span>
                      </div>
                    </div>

                    {/* Bill Download Button */}
                    <div className="ml-4">
                      <BillGenerator
                        appointmentData={formData}
                        appointmentId={appointmentId}
                        patientId={patientId}
                        doctors={doctors}
                        billNumber={billNumber} // Pass the billNumber prop here
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                      />
                    </div>
                  </div>
                  {/* Payment Breakdown */}
                  <div className="pt-3 border-t border-green-200">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs text-gray-600">
                      {watchedPaymentMethod === "mixed" && (
                        <>
                          <div className="flex justify-between">
                            <span>Cash Paid:</span>
                            <span>₹{Number(watchedCashAmount) || 0}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Online Paid:</span>
                            <span>₹{Number(watchedOnlineAmount) || 0}</span>
                          </div>
                        </>
                      )}
                      {watchedPaymentMethod === "cash" && (
                        <div className="flex justify-between">
                          <span>Cash Paid:</span>
                          <span>₹{Number(watchedCashAmount) || 0}</span>
                        </div>
                      )}
                      {(watchedPaymentMethod === "online" ||
                        watchedPaymentMethod === "card-credit" ||
                        watchedPaymentMethod === "card-debit") && (
                        <div className="flex justify-between">
                          <span>{watchedPaymentMethod === "online" ? "Online Paid" : "Card Paid"}:</span>
                          <span>₹{Number(watchedOnlineAmount) || 0}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </CardContent>
        </Card>
      )}
      {/* Notes Section */}
      <Card className="border-l-4 border-l-orange-500">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileText className="h-5 w-5 text-orange-600" />
            Additional Notes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="message" className="text-sm font-medium">
              Notes & Comments
            </Label>
            <div className="relative">
              <MessageSquare className="absolute left-3 top-3 h-4 w-4 text-gray-500" />
              <Textarea
                id="message"
                {...register("message")}
                placeholder="Enter any additional notes, special instructions, or comments (optional)"
                className="pl-10 min-h-[80px]"
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}