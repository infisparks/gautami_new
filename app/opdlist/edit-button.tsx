"use client"

import { Button } from "@/components/ui/button"
import { Edit } from "lucide-react"
import { useRouter } from "next/navigation"

interface EditButtonProps {
  uhid: string
  appointmentId: string
  className?: string
}

export function EditButton({ uhid, appointmentId, className = "" }: EditButtonProps) {
  const router = useRouter()

  const handleClick = () => {
    router.push(`/edit-appointment?uhid=${uhid}&id=${appointmentId}`)
  }

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={handleClick}
      className={`text-blue-600 hover:text-blue-700 ${className}`}
    >
      <Edit className="h-4 w-4 mr-1" />
      Edit
    </Button>
  )
}
