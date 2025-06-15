"use client";

import { useState, useEffect, useCallback } from "react";
import { db } from "@/lib/firebase";
import { ref, query, get } from "firebase/database";
import { useRouter } from "next/navigation";
import { format, startOfWeek, endOfWeek, isWithinInterval } from "date-fns";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EditButton } from "./edit-button";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Calendar, RefreshCw, Eye, ArrowUpDown, X, Filter } from "lucide-react";

// === Helpers for download size ===
function byteSize(str: string) {
  return new Blob([str]).size;
}
function humanFileSize(bytes: number) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

interface Appointment {
  id: string;
  patientId: string;
  name: string;
  phone: string;
  date: string;
  time: string;
  doctor?: string;
  appointmentType: string;
  modalities: any[];
  createdAt: string;
  payment?: {
    totalCharges: number;
    totalPaid: number;
    discount: number;
    paymentMethod: string;
  };
}

const getTodayDateKey = () => format(new Date(), "yyyy-MM-dd");

const flattenAppointments = (
  snap: Record<string, any> | null | undefined,
  filterFn: (a: any) => boolean
) => {
  const result: Appointment[] = [];
  if (!snap) return result;
  Object.entries(snap).forEach(([patientId, apps]) => {
    if (typeof apps === "object" && apps !== null) {
      Object.entries(apps as Record<string, any>).forEach(([apptId, data]) => {
        if (filterFn(data)) {
          result.push({
            id: apptId,
            patientId,
            name: data.name || "",
            phone: data.phone || "",
            date: data.date || "",
            time: data.time || "",
            doctor: data.doctor || "",
            appointmentType: data.appointmentType || "visithospital",
            modalities: data.modalities || [],
            createdAt: data.createdAt || "",
            payment: data.payment || {
              totalCharges: 0,
              totalPaid: 0,
              discount: 0,
              paymentMethod: "cash",
            },
          });
        }
      });
    }
  });
  return result;
};

export default function ManageOPDPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"today" | "week">("today");
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState({
    key: "date",
    direction: "desc" as "desc" | "asc",
  });
  const [downloadedCount, setDownloadedCount] = useState(0);
  const [downloadedBytes, setDownloadedBytes] = useState(0);

  // Fetch only today's data by default
  const fetchTodayAppointments = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const opdRef = ref(db, "patients/opddetail");
      const snap = await get(query(opdRef));
      const data = snap.val() as Record<string, any> | null;
      const todayKey = getTodayDateKey();
      const result = flattenAppointments(data, (a) => {
        return (a.date || "").split("T")[0] === todayKey;
      });
      setAppointments(result);
      setDownloadedCount(result.length);
      // Show size of all data fetched:
      const json = JSON.stringify(data || {});
      setDownloadedBytes(byteSize(json));
    } catch (err) {
      setError("Failed to load today's appointments");
      setAppointments([]);
      setDownloadedCount(0);
      setDownloadedBytes(0);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch only this week's data
  const fetchWeekAppointments = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const opdRef = ref(db, "patients/opddetail");
      const snap = await get(query(opdRef));
      const data = snap.val() as Record<string, any> | null;
      const start = startOfWeek(new Date(), { weekStartsOn: 1 });
      const end = endOfWeek(new Date(), { weekStartsOn: 1 });
      const result = flattenAppointments(data, (a) => {
        const apptDate = new Date(a.date);
        return isWithinInterval(apptDate, { start, end });
      });
      setAppointments(result);
      setDownloadedCount(result.length);
      const json = JSON.stringify(data || {});
      setDownloadedBytes(byteSize(json));
    } catch (err) {
      setError("Failed to load this week's appointments");
      setAppointments([]);
      setDownloadedCount(0);
      setDownloadedBytes(0);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Search only when search term is >= 5
  useEffect(() => {
    if (searchTerm.length < 5) {
      if (tab === "today") fetchTodayAppointments();
      else fetchWeekAppointments();
      return;
    }
    const timeout = setTimeout(async () => {
      setSearching(true);
      setError(null);
      try {
        const opdRef = ref(db, "patients/opddetail");
        const snap = await get(query(opdRef));
        const data = snap.val() as Record<string, any> | null;
        const t = searchTerm.toLowerCase();
        const result = flattenAppointments(data, (a) =>
          (a.name || "").toLowerCase().includes(t) ||
          (a.phone || "").includes(t)
        );
        setAppointments(result);
        setDownloadedCount(result.length);
        const json = JSON.stringify(data || {});
        setDownloadedBytes(byteSize(json));
      } catch (err) {
        setError("Failed to search appointments");
        setAppointments([]);
        setDownloadedCount(0);
        setDownloadedBytes(0);
      } finally {
        setSearching(false);
      }
    }, 500);
    return () => clearTimeout(timeout);
  }, [searchTerm, tab, fetchTodayAppointments, fetchWeekAppointments]);

  // Initial load
  useEffect(() => {
    setSearchTerm("");
    if (tab === "today") fetchTodayAppointments();
    else fetchWeekAppointments();
  }, [tab, fetchTodayAppointments, fetchWeekAppointments]);

  // Sorting
  const sortedAppointments = [...appointments].sort((a, b) => {
    const { key, direction } = sortConfig;
    if (key === "date") {
      const da = new Date(a.date).getTime();
      const db = new Date(b.date).getTime();
      return direction === "asc" ? da - db : db - da;
    }
    const va = (a as any)[key];
    const vb = (b as any)[key];
    if (typeof va === "string" && typeof vb === "string")
      return direction === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
    return 0;
  });

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white shadow-sm border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-primary rounded-lg flex items-center justify-center">
              <Calendar className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">OPD Management</h1>
              <p className="text-sm text-gray-500">Fast, filtered OPD dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" onClick={() => router.push("/opd")} className="hidden md:flex gap-2">
                    <Calendar className="h-4 w-4" />
                    New Appointment
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Schedule a new appointment</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="default" onClick={() => tab === "today" ? fetchTodayAppointments() : fetchWeekAppointments()} disabled={isLoading}>
                    <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
                    Refresh
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Refresh</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        <Tabs value={tab} onValueChange={v => setTab(v as any)} className="w-full mb-4">
          <TabsList className="bg-slate-100">
            <TabsTrigger value="today">Today</TabsTrigger>
            <TabsTrigger value="week">This Week</TabsTrigger>
          </TabsList>
        </Tabs>
        <Card className="mb-6 border border-slate-200 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Fast Search
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="flex items-center gap-4 flex-wrap">
              <Input
                placeholder="Type at least 5 letters/digits to search by name or phone..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="max-w-md"
              />
              {searching && <span className="text-sm text-blue-600">Searching...</span>}
              {error && <span className="text-sm text-red-600">{error}</span>}
              {isLoading && !searching && <Skeleton className="h-6 w-32" />}
              <span className="text-xs text-gray-500">
                Downloaded: <b>{downloadedCount}</b> record{downloadedCount === 1 ? "" : "s"},{" "}
                <b>{humanFileSize(downloadedBytes)}</b> from database
              </span>
              {searchTerm.length > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setSearchTerm("")} className="h-8 gap-1">
                  <X className="h-3 w-3" /> Clear
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
        <Card className="border border-slate-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              {tab === "today" ? "Today's Appointments" : "This Week's Appointments"}
            </CardTitle>
            <CardDescription>
              {appointments.length
                ? `${appointments.length} found`
                : isLoading
                ? "Loading..."
                : "No appointments"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : (
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader className="bg-slate-50">
                    <TableRow>
                      <TableHead className="w-[200px]">
                        <Button
                          variant="ghost"
                          onClick={() => setSortConfig({ key: "name", direction: sortConfig.direction === "asc" ? "desc" : "asc" })}
                          className="flex items-center gap-1 p-0 h-auto font-medium"
                        >
                          Patient <ArrowUpDown className="h-3 w-3" />
                        </Button>
                      </TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedAppointments.map((app) => (
                      <TableRow key={`${app.patientId}-${app.id}`} className="hover:bg-slate-50">
                        <TableCell className="font-medium">{app.name}<div className="text-xs text-gray-500">{app.phone}</div></TableCell>
                        <TableCell>{format(new Date(app.date), "dd/MM/yyyy")}</TableCell>
                        <TableCell>
                          <Badge variant={app.appointmentType === "visithospital" ? "default" : "secondary"}>
                            {app.appointmentType === "visithospital" ? "Visit" : "On Call"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          ₹{app.payment?.totalPaid ?? app.modalities.reduce((sum, m) => sum + (m.charges || 0), 0)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon">
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>View</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <EditButton
                                    uhid={app.patientId}
                                    appointmentId={app.id}
                                    compact
                                    className="h-8 w-8 p-0"
                                  />
                                </TooltipTrigger>
                                <TooltipContent>Edit</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
