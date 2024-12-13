"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LayoutDashboard, Users, ClipboardList, UserPlus, BedDouble, LogOut, ChevronDown, Menu, X } from 'lucide-react';
import { auth } from "../lib/firebase"; // Adjust the import path as necessary
import { signOut } from "firebase/auth";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { toast } from "react-toastify";
import Image from "next/image";
import logo from "./logo.png"; // Ensure the path is correct

interface NavItemProps {
  title: string;
  icon: React.ReactNode;
  href?: string;
  submenu?: NavItemProps[];
}

const navItems: NavItemProps[] = [
  {
    title: "Dashboard",
    icon: <LayoutDashboard size={20} />,
    href: "/dashboard",
  },
  {
    title: "Manage Admin",
    icon: <Users size={20} />,
    submenu: [
      { title: "OPD Admin", icon: <ClipboardList size={20} />, href: "/opdadmin" },
      { title: "IPD Admin", icon: <ClipboardList size={20} />, href: "/ipdadmin" },
      { title: "Patient Admin", icon: <BedDouble size={20} />, href: "/patientadmin" },
      { title: "Pathology Admin", icon: <BedDouble size={20} />, href: "/bloodadmin" },
    ],
  },
  {
    title: "OPD",
    icon: <Users size={20} />,
    submenu: [
      { title: "Appointment", icon: <ClipboardList size={20} />, href: "/opd" },
      { title: "Add Doctor", icon: <UserPlus size={20} />, href: "/addDoctor" },
    ],
  },
  {
    title: "IPD",
    icon: <Users size={20} />,
    submenu: [
      { title: "IPD Appointment", icon: <ClipboardList size={20} />, href: "/ipd" },
      { title: "IPD Billing", icon: <ClipboardList size={20} />, href: "/billing" },
      { title: "Bed Management", icon: <BedDouble size={20} />, href: "/bed-management" },
    ],
  },
  {
    title: "Pathology",
    icon: <LayoutDashboard size={20} />,
    href: "/bloodtest",
  },
];

const Sidebar: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [openSubmenus, setOpenSubmenus] = useState<{ [key: string]: boolean }>({});
  const router = useRouter();
  const pathname = usePathname();
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const toggleSidebar = () => {
    setIsOpen(!isOpen);
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.push("/login");
    } catch (error) {
      console.error("Error signing out: ", error);
      toast.error("Failed to logout. Please try again.", {
        position: "top-right",
        autoClose: 5000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
      });
    }
  };

  const toggleSubmenu = (title: string) => {
    setOpenSubmenus((prev) => ({
      ...prev,
      [title]: !prev[title],
    }));
  };

  const sidebarVariants = {
    open: { x: 0, transition: { type: "spring", stiffness: 300, damping: 30 } },
    closed: { x: "-100%", transition: { type: "spring", stiffness: 300, damping: 30 } },
  };

  const renderNavItems = (items: NavItemProps[]) => {
    return items.map((item) => {
      const isActive = pathname === item.href;
      const hasSubmenu = item.submenu && item.submenu.length > 0;
      const isSubmenuOpen = openSubmenus[item.title];

      return (
        <motion.div
          key={item.title}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="mb-1"
        >
          {hasSubmenu ? (
            <>
              <button
                className={`flex items-center w-full p-2 text-gray-300 hover:bg-blue-700 hover:text-white rounded-md transition-colors ${
                  isActive ? "bg-blue-700 text-white" : ""
                }`}
                onClick={() => toggleSubmenu(item.title)}
                aria-expanded={isSubmenuOpen ? "true" : "false"}
                aria-controls={`${item.title}-submenu`}
              >
                <span className="inline-flex items-center justify-center w-8 h-8 mr-2 rounded-md bg-blue-800 text-white">
                  {item.icon}
                </span>
                <span className="flex-1 text-left font-medium">{item.title}</span>
                <motion.span
                  animate={{ rotate: isSubmenuOpen ? 180 : 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <ChevronDown size={16} />
                </motion.span>
              </button>
              <AnimatePresence>
                {isSubmenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.3 }}
                    id={`${item.title}-submenu`}
                    className="ml-8 mt-1 space-y-1"
                    role="menu"
                    aria-label={`${item.title} submenu`}
                  >
                    {item.submenu!.map((subItem) => {
                      const isSubActive = pathname === subItem.href;
                      return (
                        <Link key={subItem.title} href={subItem.href || "#"}>
                          <span
                            className={`flex items-center p-2 text-sm text-gray-400 hover:bg-blue-700 hover:text-white rounded-md transition-colors cursor-pointer ${
                              isSubActive ? "bg-blue-700 text-white" : ""
                            }`}
                            role="menuitem"
                          >
                            <span className="w-1 h-1 mr-2 rounded-full bg-blue-500"></span>
                            <span>{subItem.title}</span>
                          </span>
                        </Link>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          ) : (
            <Link href={item.href || "#"}>
              <span
                className={`flex items-center p-2 text-gray-300 hover:bg-blue-700 hover:text-white rounded-md transition-colors cursor-pointer ${
                  isActive ? "bg-blue-700 text-white" : ""
                }`}
                role="menuitem"
              >
                <span className="inline-flex items-center justify-center w-8 h-8 mr-2 rounded-md bg-blue-800 text-white">
                  {item.icon}
                </span>
                <span className="font-medium">{item.title}</span>
              </span>
            </Link>
          )}
        </motion.div>
      );
    });
  };

  return (
    <div className="flex">
      {/* Mobile Toggle Button */}
      <AnimatePresence>
        {isMobile && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.3 }}
            className="md:hidden fixed top-4 left-4 z-50 p-2 bg-blue-600 text-white rounded-full shadow-lg"
            onClick={toggleSidebar}
            aria-label="Toggle Sidebar"
          >
            {isOpen ? <X size={20} /> : <Menu size={20} />}
          </motion.button>
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside
        variants={sidebarVariants}
        initial="closed"
        animate={isOpen || !isMobile ? "open" : "closed"}
        className="bg-gray-900 text-gray-100 w-64 h-screen fixed top-0 left-0 z-40 shadow-xl"
        aria-label="Sidebar"
      >
        {/* Header with Logo */}
        <div className="flex items-center justify-start h-16 bg-gray-800 border-b border-gray-700 px-4">
          <div className="flex items-center">
            <div className="bg-white rounded-full p-1 shadow-md">
              <Image src={logo} alt="Logo" width={42} height={42} className="rounded-full" />
            </div>
            <span className="text-xl font-bold text-white ml-2">Gautami Hospital</span>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="mt-4 px-3" role="menu">
          <div className="space-y-1">{renderNavItems(navItems)}</div>
        </nav>

        {/* Logout Button */}
        <div className="absolute bottom-0 w-full p-4 border-t border-gray-800">
          <button
            onClick={handleLogout}
            className="flex items-center w-full p-2 text-gray-300 hover:bg-blue-700 hover:text-white rounded-md transition-colors"
            aria-label="Logout"
          >
            <span className="inline-flex items-center justify-center w-8 h-8 mr-2 rounded-md bg-blue-800 text-white">
              <LogOut size={20} />
            </span>
            <span className="font-medium">Logout</span>
          </button>
        </div>
      </motion.aside>

      {/* Overlay for Mobile */}
      <AnimatePresence>
        {isOpen && isMobile && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 bg-black bg-opacity-50 z-30 md:hidden"
            onClick={toggleSidebar}
            aria-hidden="true"
          ></motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <div className="flex-1 ml-0 md:ml-64">
        {/* The rest of your page content goes here */}
      </div>
    </div>
  );
};

export default Sidebar;

