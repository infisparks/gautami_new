"use client";

import React, { useState } from "react";
import {
  LayoutDashboard,
  Users,
  ClipboardList,
  UserPlus,
  BedDouble,
  LogOut,
  ChevronDown,
  ChevronUp,
  Menu,
  X,
} from "lucide-react";
import { auth } from "../lib/firebase"; // Adjust the import path as necessary
import { signOut } from "firebase/auth";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { toast } from "react-toastify";
import Image from "next/image"; // Import Image from Next.js
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

  const renderNavItems = (items: NavItemProps[]) => {
    return items.map((item) => {
      const isActive = pathname === item.href;
      const hasSubmenu = item.submenu && item.submenu.length > 0;
      const isSubmenuOpen = openSubmenus[item.title];

      return (
        <div key={item.title} className="mb-2">
          {hasSubmenu ? (
            <>
              <button
                className={`flex items-center w-full p-3 text-gray-300 hover:bg-gray-700 hover:text-white rounded-lg transition-colors ${
                  isActive ? "bg-gray-700 text-white" : ""
                }`}
                onClick={() => toggleSubmenu(item.title)}
                aria-expanded={isSubmenuOpen ? "true" : "false"}
                aria-controls={`${item.title}-submenu`}
              >
                <span className="inline-flex items-center justify-center w-8 h-8 mr-3 rounded-lg bg-gray-800 text-gray-300">
                  {item.icon}
                </span>
                <span className="flex-1 text-left font-medium">{item.title}</span>
                {isSubmenuOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
              {isSubmenuOpen && (
                <div
                  id={`${item.title}-submenu`}
                  className="ml-11 mt-2 space-y-2"
                  role="menu"
                  aria-label={`${item.title} submenu`}
                >
                  {item.submenu!.map((subItem) => {
                    const isSubActive = pathname === subItem.href;
                    return (
                      <Link key={subItem.title} href={subItem.href || "#"}>
                        <span
                          className={`flex items-center p-2 text-gray-400 hover:bg-gray-700 hover:text-white rounded-lg transition-colors cursor-pointer ${
                            isSubActive ? "bg-gray-700 text-white" : ""
                          }`}
                          role="menuitem"
                        >
                          <span className="w-2 h-2 mr-3 rounded-full bg-gray-600"></span>
                          <span>{subItem.title}</span>
                        </span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <Link href={item.href || "#"}>
              <span
                className={`flex items-center p-3 text-gray-300 hover:bg-gray-700 hover:text-white rounded-lg transition-colors cursor-pointer ${
                  isActive ? "bg-gray-700 text-white" : ""
                }`}
                role="menuitem"
              >
                <span className="inline-flex items-center justify-center w-8 h-8 mr-3 rounded-lg bg-gray-800 text-gray-300">
                  {item.icon}
                </span>
                <span className="font-medium">{item.title}</span>
              </span>
            </Link>
          )}
        </div>
      );
    });
  };

  return (
    <div className="flex">
      {/* Mobile Toggle Button */}
      <button
        className="md:hidden fixed top-4 left-4 z-50 p-2 bg-indigo-600 text-white rounded-full shadow-lg"
        onClick={toggleSidebar}
        aria-label="Toggle Sidebar"
      >
        {isOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Sidebar */}
      <aside
        className={`bg-gray-900 text-white w-64 h-screen fixed top-0 left-0 z-40 transform transition-all duration-300 ease-in-out ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0`}
        aria-label="Sidebar"
      >
        {/* Header with Logo */}
        <div className="flex items-center  justify-start h-28 items-center items-center bg-gray-800 border-b border-gray-700 px-4">
          <div className="flex items-center">
            <div className="bg-white rounded p-1 m-0 items-center">

            <Image src={logo} alt="Logo" width={50} height={50} className="mr-3" />
            </div>
            <span className="text-xl font-bold text-white pl-2">Gaumati</span>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="mt-6 px-4" role="menu">
          <div className="space-y-1">{renderNavItems(navItems)}</div>
        </nav>

        {/* Logout Button */}
        <div className="absolute bottom-0 w-full p-4 border-t border-gray-800">
          <button
            onClick={handleLogout}
            className="flex items-center w-full p-3 text-gray-300 hover:bg-gray-700 hover:text-white rounded-lg transition-colors"
            aria-label="Logout"
          >
            <span className="inline-flex items-center justify-center w-8 h-8 mr-3 rounded-lg bg-gray-800 text-gray-300">
              <LogOut size={20} />
            </span>
            <span className="font-medium">Logout</span>
          </button>
        </div>
      </aside>

      {/* Overlay for Mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-30 md:hidden"
          onClick={toggleSidebar}
          aria-hidden="true"
        ></div>
      )}

      {/* Main Content */}
      <div className="flex-1 ml-0 md:ml-64">
        {/* The rest of your page content goes here */}
      </div>
    </div>
  );
};

export default Sidebar;
