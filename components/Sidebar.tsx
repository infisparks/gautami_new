"use client";

import React, { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { signOut } from "firebase/auth";
import { auth } from "../lib/firebase"; // Adjust path as necessary
import { toast } from "react-toastify";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { LayoutDashboard, Users, ClipboardList, UserPlus, BedDouble, LogOut, ChevronDown, Menu, X, Activity, Stethoscope, Syringe, FileText, Scissors } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import  logo from "./logo.png"

interface NavItemProps {
  title: string;
  icon: React.ReactNode;
  href?: string;
  submenu?: NavItemProps[];
}

interface SidebarProps {
  userType: string | null; // "admin" or "staff" or null
}

const Sidebar: React.FC<SidebarProps> = ({ userType }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [openSubmenus, setOpenSubmenus] = useState<{ [key: string]: boolean }>({});
  const router = useRouter();
  const pathname = usePathname();
  const [isMobile, setIsMobile] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile && isOpen) {
        setIsOpen(false);
      }
    };
    
    // Check if user has a preference stored
    const collapsedPref = localStorage.getItem('sidebarCollapsed');
    if (collapsedPref) {
      setIsCollapsed(collapsedPref === 'true');
    }
    
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, [isOpen]);

  const toggleSidebar = () => {
    setIsOpen(!isOpen);
  };

  const toggleCollapse = () => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    localStorage.setItem('sidebarCollapsed', String(newState));
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.push("/login");
      toast.success("Successfully logged out", {
        position: "top-right",
        autoClose: 3000,
      });
    } catch (error) {
      console.error("Error signing out: ", error);
      toast.error("Failed to logout. Please try again.", {
        position: "top-right",
        autoClose: 5000,
      });
    }
  };

  const toggleSubmenu = (title: string) => {
    setOpenSubmenus((prev) => ({
      ...prev,
      [title]: !prev[title],
    }));
  };

  // Define your navigation items with better icons
  let navItems: NavItemProps[] = [
    {
      title: "Dashboard",
      icon: <LayoutDashboard size={20} />,
      href: "/dashboard",
    },
    {
      title: "Manage Admin",
      icon: <Users size={20} />,
      submenu: [
        { title: "OPD Admin", icon: <Stethoscope size={20} />, href: "/opdadmin" },
        { title: "IPD Admin", icon: <BedDouble size={20} />, href: "/ipdadmin" },
        { title: "Patient Admin", icon: <FileText size={20} />, href: "/patientadmin" },
        // { title: "Pathology Admin", icon: <Syringe size={20} />, href: "/bloodadmin" },
        { title: "Mortality Report", icon: <Activity size={20} />, href: "/mortalityadmin" },
        // { title: "Surgery Report", icon: <Scissors size={20} />, href: "/surgeryadmin" },
        { title: "DPR", icon: <ClipboardList size={20} />, href: "/dr" },
        { title: "Add Service", icon: <ClipboardList size={20} />, href: "/makeservice" },
      ],
    },
    {
      title: "OPD",
      icon: <Stethoscope size={20} />,
      submenu: [
        { title: "Appointment", icon: <ClipboardList size={20} />, href: "/opd" },
        { title: "Add Doctor", icon: <UserPlus size={20} />, href: "/addDoctor" },
      ],
    },

    {
      title: "Casualty",
      icon: <Stethoscope size={20} />,
      submenu: [
        { title: "Casualty", icon: <ClipboardList size={20} />, href: "/casulity" },
        { title: "Casualty List", icon: <UserPlus size={20} />, href: "/casulity/list" },
      ],
    },

    {
      title: "IPD",
      icon: <BedDouble size={20} />,
      submenu: [
        { title: "IPD Appointment", icon: <ClipboardList size={20} />, href: "/ipd" },
        { title: "IPD Management", icon: <FileText size={20} />, href: "/billing" },
        { title: "Bed Management", icon: <BedDouble size={20} />, href: "/bed-management" },
      ],
    },
    // {
    //   title: "Pathology",
    //   icon: <Syringe size={20} />,
    //   href: "/bloodtest",
    // },
    {
      title: "Mortality",
      icon: <Activity size={20} />,
      href: "/mortality",
    },
    // {
    //   title: "Surgery",
    //   icon: <Scissors size={20} />,
    //   href: "/surgery",
    // },
  ];

  // Hide "Dashboard" and "Manage Admin" if userType is "staff"
  if (userType === "staff") {
    navItems = navItems.filter(
      (item) => item.title !== "Dashboard" && item.title !== "Manage Admin"
    );
  }

  // Renders the menu and submenus
  const renderNavItems = (items: NavItemProps[]) => {
    return items.map((item) => {
      const isActive = pathname === item.href || 
                      (item.submenu?.some(sub => pathname === sub.href));
      const hasSubmenu = item.submenu && item.submenu.length > 0;
      const isSubmenuOpen = openSubmenus[item.title];

      return (
        <div key={item.title} className="mb-1">
          {hasSubmenu ? (
            <div>
              <TooltipProvider delayDuration={350}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      className={cn(
                        "flex items-center w-full p-2.5 text-gray-300 hover:bg-primary/20 hover:text-white rounded-md transition-all duration-200",
                        isActive && "bg-primary/30 text-white font-medium",
                        "group relative"
                      )}
                      onClick={() => toggleSubmenu(item.title)}
                      aria-expanded={isSubmenuOpen ? "true" : "false"}
                      aria-controls={`${item.title}-submenu`}
                    >
                      <span className={cn(
                        "inline-flex items-center justify-center w-9 h-9 rounded-md bg-primary/20 text-white mr-3 transition-all",
                        isActive && "bg-primary/40"
                      )}>
                        {item.icon}
                      </span>
                      <span className={cn(
                        "flex-1 text-left font-medium transition-opacity duration-200",
                        isCollapsed && "opacity-0 w-0 overflow-hidden"
                      )}>
                        {item.title}
                      </span>
                      <ChevronDown 
                        size={16} 
                        className={cn(
                          "transition-transform duration-200",
                          isSubmenuOpen && "rotate-180",
                          isCollapsed && "opacity-0 w-0 overflow-hidden"
                        )} 
                      />
                    </button>
                  </TooltipTrigger>
                  {isCollapsed && (
                    <TooltipContent side="right" className="bg-gray-800 text-white border-gray-700">
                      {item.title}
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
              
              <div
                className={cn(
                  "ml-12 mt-1 space-y-1 overflow-hidden transition-all duration-200",
                  isSubmenuOpen ? "max-h-96" : "max-h-0",
                  isCollapsed && "ml-0 flex flex-col items-center"
                )}
                id={`${item.title}-submenu`}
                role="menu"
                aria-label={`${item.title} submenu`}
              >
                {item.submenu!.map((subItem) => {
                  const isSubActive = pathname === subItem.href;
                  
                  return (
                    <TooltipProvider key={subItem.title} delayDuration={350}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Link href={subItem.href || "#"}>
                            <span
                              className={cn(
                                "flex items-center p-2 text-sm text-gray-400 hover:bg-primary/20 hover:text-white rounded-md transition-all duration-200 cursor-pointer",
                                isSubActive && "bg-primary/30 text-white",
                                isCollapsed && "justify-center w-10 h-10 p-0 mx-auto"
                              )}
                              role="menuitem"
                            >
                              {isCollapsed ? (
                                <span className={cn(
                                  "inline-flex items-center justify-center w-8 h-8 rounded-md bg-primary/20 text-white",
                                  isSubActive && "bg-primary/40"
                                )}>
                                  {subItem.icon}
                                </span>
                              ) : (
                                <>
                                  <span className="w-1.5 h-1.5 mr-2 rounded-full bg-primary/70"></span>
                                  <span>{subItem.title}</span>
                                </>
                              )}
                            </span>
                          </Link>
                        </TooltipTrigger>
                        {isCollapsed && (
                          <TooltipContent side="right" className="bg-gray-800 text-white border-gray-700">
                            {subItem.title}
                          </TooltipContent>
                        )}
                      </Tooltip>
                    </TooltipProvider>
                  );
                })}
              </div>
            </div>
          ) : (
            <TooltipProvider delayDuration={350}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link href={item.href || "#"}>
                    <span
                      className={cn(
                        "flex items-center p-2.5 text-gray-300 hover:bg-primary/20 hover:text-white rounded-md transition-all duration-200 cursor-pointer",
                        isActive && "bg-primary/30 text-white font-medium"
                      )}
                      role="menuitem"
                    >
                      <span className={cn(
                        "inline-flex items-center justify-center w-9 h-9 rounded-md bg-primary/20 text-white mr-3 transition-all",
                        isActive && "bg-primary/40"
                      )}>
                        {item.icon}
                      </span>
                      <span className={cn(
                        "font-medium transition-opacity duration-200",
                        isCollapsed && "opacity-0 w-0 overflow-hidden"
                      )}>
                        {item.title}
                      </span>
                    </span>
                  </Link>
                </TooltipTrigger>
                {isCollapsed && (
                  <TooltipContent side="right" className="bg-gray-800 text-white border-gray-700">
                    {item.title}
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      );
    });
  };

  return (
    <div className="flex">
      {/* Mobile Toggle Button */}
      <div className="md:hidden fixed top-4 left-4 z-50">
        <Button
          variant="outline"
          size="icon"
          className="bg-primary text-white border-primary/50 hover:bg-primary/90 hover:text-white shadow-lg"
          onClick={toggleSidebar}
          aria-label="Toggle Sidebar"
        >
          {isOpen ? <X size={20} /> : <Menu size={20} />}
        </Button>
      </div>

      {/* Sidebar itself */}
      <aside
        className={cn(
          "bg-gray-900 text-gray-100 h-screen fixed top-0 left-0 z-40 shadow-xl flex flex-col transition-all duration-300 ease-in-out",
          isCollapsed ? "w-[70px]" : "w-64",
          isMobile && !isOpen ? "-translate-x-full" : "translate-x-0"
        )}
        aria-label="Sidebar"
      >
        {/* Header with Logo */}
        <div className="flex items-center justify-between h-16 bg-gray-800 border-b border-gray-700 px-4 flex-shrink-0">
          <div className={cn(
            "flex items-center transition-opacity duration-200",
            isCollapsed && "justify-center w-full"
          )}>
            <div className="bg-white rounded-full p-1 shadow-md flex-shrink-0">
              <Image src={logo} alt="Logo" width={42} height={42} className="rounded-full" />
            </div>
            <span className={cn(
              "text-xl font-bold text-white ml-2 transition-opacity duration-200",
              isCollapsed && "opacity-0 w-0 overflow-hidden"
            )}>
              G Medford NX
            </span>
          </div>
          
          {/* Collapse button (desktop only) */}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleCollapse}
            className={cn(
              "hidden md:flex hover:bg-gray-700 text-gray-400 hover:text-white",
              isCollapsed && "absolute right-3"
            )}
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <ChevronDown className={cn(
              "h-5 w-5 transition-transform",
              isCollapsed ? "rotate-90" : "-rotate-90"
            )} />
          </Button>
        </div>

        {/* Navigation Items */}
        <nav className={cn(
          "mt-4 px-3 flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-gray-900",
          isCollapsed && "px-2"
        )} role="menu">
          <div className="space-y-1">{renderNavItems(navItems)}</div>
        </nav>

        {/* Separator before logout */}
        <Separator className="my-2 bg-gray-800" />

        {/* Logout Button */}
        <div className={cn(
          "w-full p-4 flex-shrink-0",
          isCollapsed && "p-2"
        )}>
          <TooltipProvider delayDuration={350}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleLogout}
                  className={cn(
                    "flex items-center w-full p-2.5 text-gray-300 hover:bg-red-900/30 hover:text-white rounded-md transition-all duration-200",
                    isCollapsed && "justify-center p-2"
                  )}
                  aria-label="Logout"
                >
                  <span className="inline-flex items-center justify-center w-9 h-9 rounded-md bg-red-900/30 text-white mr-3">
                    <LogOut size={20} />
                  </span>
                  <span className={cn(
                    "font-medium transition-opacity duration-200",
                    isCollapsed && "opacity-0 w-0 overflow-hidden"
                  )}>
                    Logout
                  </span>
                </button>
              </TooltipTrigger>
              {isCollapsed && (
                <TooltipContent side="right" className="bg-gray-800 text-white border-gray-700">
                  Logout
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        </div>
      </aside>

      {/* Overlay for Mobile */}
      {isOpen && isMobile && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-30 md:hidden backdrop-blur-sm transition-opacity duration-300"
          onClick={toggleSidebar}
          aria-hidden="true"
        />
      )}

      {/* Main Content (to the right of the sidebar) */}
      <div className={cn(
        "flex-1 transition-all duration-300 ease-in-out",
        isCollapsed ? "md:ml-[70px]" : "md:ml-64"
      )}>
        {/* Your main content goes here */}
      </div>
    </div>
  );
};

export default Sidebar;
