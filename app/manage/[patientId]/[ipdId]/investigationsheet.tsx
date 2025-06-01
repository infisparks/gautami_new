/* ------------------------------------------------------------------ */
/*  app/manage/[patientId]/[ipdId]/investigationsheet.tsx             */
/* ------------------------------------------------------------------ */
/*  ✔ Compress image ≤ 200 KB before upload                           */
/*  ✔ Callback-ref so RHF gets FileList                               */
/*  ✔ Progress bar, error logs, full feature set                      */
/* ------------------------------------------------------------------ */

"use client"

import React, { useEffect, useState, useRef } from "react"
import { useParams } from "next/navigation"
import { useForm, type SubmitHandler } from "react-hook-form"
import {
  ref as dbRef,
  push,
  set,
  update,
  onValue,
} from "firebase/database"
import {
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
} from "firebase/storage"
import { db, auth, storage } from "@/lib/firebase"

import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious,
} from "@/components/ui/carousel"

import format from "date-fns/format"
import { jsPDF } from "jspdf"
import { Eye, Download, X, FileImage, Loader2 } from "lucide-react"

/* ───────── Types ───────── */
interface InvestigationEntry {
  dateTime: string
  value: string
  type: "text" | "image"
}
interface InvestigationRecord {
  id?: string
  testName: string
  entries: InvestigationEntry[]
  enteredBy: string
}
interface InvestigationFormInputs {
  testName: string
  dateTime: string
  value: string
  image?: FileList
  entryType: "text" | "image"
}
interface AdditionalEntryFormInputs
  extends Omit<InvestigationFormInputs, "testName"> {}

/* ───────── Test list ───────── */
const testOptions = [
  "HIV", "HBsAg", "HCV", "HB", "WBC", "PLATELET",
  "CRP", "ESR", "PT", "INR", "PTT", "BNP",
]

/* ───────── Image-compression helper ───────── */
const compressImage = (
  file: File,
  maxKB = 200,
  maxW = 1200,
): Promise<File> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        let { width, height } = img
        if (width > maxW) {
          height = (height * maxW) / width
          width = maxW
        }
        const canvas = document.createElement("canvas")
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext("2d")!
        ctx.drawImage(img, 0, 0, width, height)

        /* iterative quality reduction */
        const attempt = (q: number) => {
          canvas.toBlob(
            (blob) => {
              if (!blob) return reject("Compression failed")
              if (blob.size / 1024 <= maxKB || q <= 0.4) {
                resolve(
                  new File(
                    [blob],
                    file.name.replace(/\.[^/.]+$/, ".jpg"),
                    { type: "image/jpeg" },
                  ),
                )
              } else {
                attempt(q - 0.1)
              }
            },
            "image/jpeg",
            q,
          )
        }
        attempt(0.8)
      }
      img.onerror = () => reject("Image load error")
      img.src = e.target!.result as string
    }
    reader.onerror = () => reject("File read error")
    reader.readAsDataURL(file)
  })

/* =================================================================== */
export default function InvestigationSheet() {
  /* URL params */
  const { patientId, ipdId } =
    useParams() as { patientId: string; ipdId: string }

  /* State */
  const [investigations, setInvestigations] =
    useState<InvestigationRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const [isUploading, setIsUploading] = useState(false)
  const [uploadPct, setUploadPct] = useState(0)
  const [imgPrev, setImgPrev] = useState<string | null>(null)

  const [addRowId, setAddRowId] = useState<string | null>(null)
  const [galleryOpen, setGalleryOpen] = useState(false)
  const [selectedRec, setSelectedRec] =
    useState<InvestigationRecord | null>(null)
  const [fullImg, setFullImg] = useState<string | null>(null)
  const [pdfBusy, setPdfBusy] = useState(false)

  /* Refs */
  const mainFileRef = useRef<HTMLInputElement | null>(null)
  const addFileRef  = useRef<HTMLInputElement | null>(null)

  /* RHF main form */
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
  } = useForm<InvestigationFormInputs>({
    defaultValues: {
      testName: "",
      dateTime: new Date().toISOString().slice(0, 16),
      value: "",
      entryType: "text",
    },
  })
  const entryType = watch("entryType")

  /* RHF add-entry form */
  const {
    register: rAdd,
    handleSubmit: hAdd,
    reset: resetAdd,
    watch: wAdd,
    setValue: setValAdd,
  } = useForm<AdditionalEntryFormInputs>({
    defaultValues: {
      dateTime: new Date().toISOString().slice(0, 16),
      value: "",
      entryType: "text",
    },
  })
  const entryTypeAdd = wAdd("entryType")

  /* Firebase path base for this component */
  const dbPath = `patients/ipddetail/userdetailipd/${patientId}/${ipdId}/investigationsheet`

  /* Fetch list */
  useEffect(() => {
    const refPath = dbRef(db, dbPath)
    return onValue(refPath, (snap) => {
      setIsLoading(false)
      if (!snap.exists()) return setInvestigations([])
      const list: InvestigationRecord[] = Object.entries(snap.val()).map(
        ([id, rec]: any) => ({
          id,
          ...rec,
          entries: Array.isArray(rec.entries) ? rec.entries : [rec.entries],
        }),
      )
      setInvestigations(list)
    })
  }, [patientId, ipdId])

  /* Fake progress helper */
  const tickProgress = () => {
    setUploadPct(0)
    const iv = setInterval(() => {
      setUploadPct((p) => (p >= 85 ? p : p + 10))
    }, 200)
    return () => clearInterval(iv)
  }

  /* Upload helper */
  const uploadImageAndGetUrl = async (file: File) => {
    setIsUploading(true)
    const stop = tickProgress()

    try {
      const compressed = await compressImage(file, 200, 1200)
      const name = `${Date.now()}_${compressed.name}`
      const refStorage = storageRef(storage,
        `patients/ipddetail/userdetailipd/${patientId}/${ipdId}/images/${name}`,
      )

      /* 1️⃣ upload */
      const snap = await uploadBytes(refStorage, compressed)

      /* 2️⃣ url */
      const url = await getDownloadURL(snap.ref)

      stop()
      setUploadPct(100)
      await new Promise((r) => setTimeout(r, 300))
      return url
    } catch (err) {
      stop()
      console.error("🔥 upload error:", err)
      alert("Image upload failed – see console for details.")
      throw err
    } finally {
      setIsUploading(false)
      setUploadPct(0)
    }
  }

  /* Submit NEW */
  const onSubmit: SubmitHandler<InvestigationFormInputs> = async (d) => {
    try {
      const file = d.image?.[0]
      const wantsImg = d.entryType === "image"

      if (wantsImg && !file) {
        alert("Select an image before submitting.")
        return
      }

      let value = d.value
      let type: "text" | "image" = "text"

      if (wantsImg && file) {
        value = await uploadImageAndGetUrl(file)
        type  = "image"
      }

      const entry: InvestigationEntry = { dateTime: d.dateTime, value, type }

      await set(
        push(dbRef(db, dbPath)),
        { testName: d.testName, entries: [entry], enteredBy: auth.currentUser?.email ?? "unknown" },
      )

      reset({
        testName: "",
        dateTime: new Date().toISOString().slice(0, 16),
        value: "",
        entryType: "text",
      })
      mainFileRef.current && (mainFileRef.current.value = "")
      setImgPrev(null)
    } catch (err) {
      console.error("🔥 NEW record error:", err)
    }
  }

  /* Submit ADD */
  const onSubmitAdd: SubmitHandler<AdditionalEntryFormInputs> = async (d) => {
    try {
      if (!addRowId) return
      const rec = investigations.find((r) => r.id === addRowId)!
      const file = d.image?.[0]
      const wantsImg = d.entryType === "image"

      if (wantsImg && !file) {
        alert("Select an image before submitting.")
        return
      }

      let value = d.value
      let type: "text" | "image" = "text"

      if (wantsImg && file) {
        value = await uploadImageAndGetUrl(file)
        type  = "image"
      }

      const updated = [
        ...rec.entries,
        { dateTime: d.dateTime, value, type },
      ]

      await update(
        dbRef(db,
          `${dbPath}/${addRowId}`,
        ),
        { entries: updated },
      )

      resetAdd({
        dateTime: new Date().toISOString().slice(0, 16),
        value: "",
        entryType: "text",
      })
      addFileRef.current && (addFileRef.current.value = "")
      setImgPrev(null)
      setAddRowId(null)
    } catch (err) {
      console.error("🔥 ADD entry error:", err)
    }
  }

  /* Preview */
  const preview = (e: React.ChangeEvent<HTMLInputElement>, add = false) => {
    const f = e.target.files?.[0]
    if (!f) return
    const rd = new FileReader()
    rd.onloadend = () => setImgPrev(rd.result as string)
    rd.readAsDataURL(f)
    add ? setValAdd("entryType", "image") : setValue("entryType", "image")
  }

  /* Generate PDF (unchanged) */
  const generatePDF = async () => {
    if (!selectedRec) return
    setPdfBusy(true)
    try {
      const imgs = selectedRec.entries.filter((e) => e.type === "image")
      if (imgs.length === 0) return alert("No images to export.")
      const pdf = new jsPDF()
      let y = 20
      const pH = pdf.internal.pageSize.height
      pdf.setFontSize(16).text(`${selectedRec.testName} – Images`, 20, y)
      y += 15

      for (const e of imgs) {
        pdf.setFontSize(12)
          .text(`Date: ${format(new Date(e.dateTime), "PPpp")}`, 20, y)
        y += 10
        const img = new Image()
        img.src = e.value
        await new Promise((r) => (img.onload = r))
        const w = 170
        const h = (img.height * w) / img.width
        if (y + h > pH - 20) { pdf.addPage(); y = 20 }
        pdf.addImage(e.value, "JPEG", 20, y, w, h)
        y += h + 20
      }
      pdf.save(`${selectedRec.testName}_Images.pdf`)
    } finally {
      setPdfBusy(false)
    }
  }

  /* ImgBtn */
  const ImgBtn = ({ url }: { url: string }) => (
    <Button variant="ghost" size="sm"
      className="flex items-center text-xs" onClick={() => setFullImg(url)}>
      <FileImage size={14} className="mr-1" />View Image
    </Button>
  )

  /* ================================================================ */
  return (
    <div className="container mx-auto px-4 py-6">
      {/* New-investigation form */}
      <Card className="mb-8 shadow">
        <CardHeader className="bg-slate-50">
          <CardTitle>Add New Investigation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 py-6">
          <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <label className="text-sm font-medium">Test</label>
                <select {...register("testName")} className="w-full border rounded p-2">
                  <option value="">Select Test</option>
                  {testOptions.map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="flex-1">
                <label className="text-sm font-medium">Date &amp; Time</label>
                <Input type="datetime-local" {...register("dateTime")} />
              </div>
            </div>

            {/* entry type radio */}
            <div>
              <label className="text-sm font-medium">Entry Type</label>
              <div className="flex space-x-6 mt-1">
                {["text", "image"].map((t) => (
                  <label key={t} className="flex items-center">
                    <input type="radio" value={t} {...register("entryType")}
                      onChange={() => setValue("entryType", t as any)}
                      checked={entryType === t} className="mr-2" />
                    {t[0].toUpperCase() + t.slice(1)}
                  </label>
                ))}
              </div>
            </div>

            {/* value / image */}
            {entryType === "text" ? (
              <>
                <label className="text-sm font-medium">Value</label>
                <Input type="text" {...register("value")} />
              </>
            ) : (
              <>
                <label className="text-sm font-medium">Upload Image</label>
                <Input
                  type="file"
                  accept="image/*"
                  {...register("image")}
                  ref={(el) => {
                    register("image").ref(el)
                    mainFileRef.current = el
                  }}
                  onChange={preview}
                  disabled={isUploading}
                />
                {isUploading && <p className="text-xs mt-1">{uploadPct}%</p>}
                {imgPrev && <img src={imgPrev} className="h-24 mt-2 rounded" />}
              </>
            )}

            <Button type="submit" disabled={isUploading} className="w-full">
              {isUploading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Add Investigation
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Records table */}
      <h2 className="text-xl font-bold mb-2">Investigation Records</h2>
      {isLoading ? (
        <p>Loading…</p>
      ) : investigations.length === 0 ? (
        <p>No records.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border">
            <thead className="bg-slate-50">
              <tr>
                <th className="border px-4 py-2">Test</th>
                <th className="border px-4 py-2">Date &amp; Time</th>
                <th className="border px-4 py-2">Value / Image</th>
                <th className="border px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {investigations.map((rec) => {
                const hasImg = rec.entries.some((e) => e.type === "image")
                return (
                  <React.Fragment key={rec.id}>
                    {rec.entries.map((e, i) => (
                      <tr key={i} className="odd:bg-slate-50 hover:bg-slate-100">
                        {i === 0 && (
                          <td className="border px-4 py-2 align-top" rowSpan={rec.entries.length}>
                            {rec.testName}
                            {hasImg && (
                              <Button variant="outline" size="sm"
                                className="flex items-center text-xs mt-2"
                                onClick={() => { setSelectedRec(rec); setGalleryOpen(true) }}>
                                <Eye size={14} className="mr-1" />Gallery
                              </Button>
                            )}
                          </td>
                        )}
                        <td className="border px-4 py-2">
                          {format(new Date(e.dateTime), "PPpp")}
                        </td>
                        <td className="border px-4 py-2">
                          {e.type === "text" ? e.value : <ImgBtn url={e.value} />}
                        </td>
                        {i === 0 && (
                          <td className="border px-4 py-2 align-top" rowSpan={rec.entries.length}>
                            <Button variant="outline" size="sm"
                              onClick={() => {
                                setAddRowId(rec.id!)
                                resetAdd({
                                  dateTime: new Date().toISOString().slice(0, 16),
                                  value: "",
                                  entryType: "text",
                                })
                              }}>
                              Add More
                            </Button>
                          </td>
                        )}
                      </tr>
                    ))}

                    {/* inline add-row */}
                    {addRowId === rec.id && (
                      <tr className="bg-slate-100">
                        <td colSpan={4} className="p-4">
                          <form className="space-y-4" onSubmit={hAdd(onSubmitAdd)}>
                            <div className="flex flex-col md:flex-row gap-4">
                              <Input type="datetime-local" {...rAdd("dateTime")} className="flex-1" />
                              <div className="flex-1 flex space-x-6">
                                {["text", "image"].map((t) => (
                                  <label key={t} className="flex items-center">
                                    <input type="radio" value={t} {...rAdd("entryType")}
                                      onChange={() => setValAdd("entryType", t as any)}
                                      checked={entryTypeAdd === t} className="mr-2" />
                                    {t[0].toUpperCase() + t.slice(1)}
                                  </label>
                                ))}
                              </div>
                            </div>

                            {entryTypeAdd === "text" ? (
                              <Input type="text" {...rAdd("value")} placeholder="Value" />
                            ) : (
                              <>
                                <Input
                                  type="file"
                                  accept="image/*"
                                  {...rAdd("image")}
                                  ref={(el) => {
                                    rAdd("image").ref(el)
                                    addFileRef.current = el
                                  }}
                                  onChange={(e) => preview(e, true)}
                                  disabled={isUploading}
                                />
                                {isUploading && <p className="text-xs">{uploadPct}%</p>}
                                {imgPrev && <img src={imgPrev} className="h-20 rounded mt-2" />}
                              </>
                            )}

                            <div className="flex space-x-2">
                              <Button size="sm" disabled={isUploading}>
                                {isUploading && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                                Save
                              </Button>
                              <Button variant="ghost" size="sm"
                                onClick={() => { setAddRowId(null); setImgPrev(null) }}>
                                Cancel
                              </Button>
                            </div>
                          </form>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Gallery dialog */}
      <Dialog open={galleryOpen} onOpenChange={setGalleryOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex justify-between items-center">
              <span>{selectedRec?.testName} – Images</span>
              <Button variant="outline" size="sm" className="flex items-center"
                disabled={pdfBusy} onClick={generatePDF}>
                <Download size={14} className="mr-1" />
                {pdfBusy ? "Generating…" : "Download PDF"}
              </Button>
            </DialogTitle>
          </DialogHeader>
          {selectedRec && (
            <Carousel className="w-full">
              <CarouselContent>
                {selectedRec.entries
                  .filter((e) => e.type === "image")
                  .sort((a, b) => +new Date(b.dateTime) - +new Date(a.dateTime))
                  .map((e, i) => (
                    <CarouselItem key={i}>
                      <div className="p-1">
                        <img src={e.value}
                          className="max-h-[70vh] w-full object-contain cursor-pointer"
                          onClick={() => setFullImg(e.value)} />
                        <p className="text-center text-sm text-gray-600 mt-2">
                          {format(new Date(e.dateTime), "PPpp")}
                        </p>
                      </div>
                    </CarouselItem>
                  ))}
              </CarouselContent>
              <CarouselPrevious />
              <CarouselNext />
            </Carousel>
          )}
        </DialogContent>
      </Dialog>

      {/* Full-screen image */}
      <Dialog open={!!fullImg} onOpenChange={(o) => !o && setFullImg(null)}>
        <DialogContent className="max-w-7xl h-[90vh] flex items-center justify-center p-0">
          <div className="relative w-full h-full flex items-center justify-center bg-black">
            <Button variant="ghost" size="icon"
              className="absolute top-4 right-4 text-white bg-black/50"
              onClick={() => setFullImg(null)}>
              <X />
            </Button>
            {fullImg && (
              <img src={fullImg} className="max-w-full max-h-full object-contain" />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
