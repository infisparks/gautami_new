// components/Sidebar.tsx
"use client";

import React, { useState } from "react";
import {
  FaUserMd,
  FaTachometerAlt,
  FaUsers,
  FaClipboardList,
  FaChartBar,
  FaRegCalendarAlt,
  FaMoneyBillWave,
  FaCog,
  FaSignOutAlt,
  FaAngleDown,
  FaAngleUp,
  FaBars,
  FaTimes,
} from "react-icons/fa";
import { auth } from "../lib/firebase"; // Adjust the import path as necessary
import { signOut } from "firebase/auth";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { toast } from "react-toastify"; // Import toast for error handling

interface NavItemProps {
  title: string;
  icon: React.ReactElement;
  href?: string;
  submenu?: NavItemProps[];
}

const navItems: NavItemProps[] = [
  {
    title: "Dashboard",
    icon: <FaTachometerAlt />,
    href: "/dashboard",
  },
  {
    title: "OPD",
    icon: <FaUsers />,
    submenu: [
      { title: "Appointment", icon: <FaClipboardList />, href: "/opd" },
      { title: "Add Doctor", icon: <FaUserMd />, href: "/addDoctor" },
    ],
  },
  {
    title: "iPD",
    icon: <FaUsers />,
    submenu: [
      { title: "IPD Appointment", icon: <FaClipboardList />, href: "/ipd" },
      { title: "IPD Billing ", icon: <FaUserMd />, href: "/billing" },
      { title: "Bed Management", icon: <FaClipboardList />, href: "/bed-management" },
    ],
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
      router.push("/login"); // Redirect to login after logout
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
        <div key={item.title}>
          {hasSubmenu ? (
            <>
              <button
                className={`flex items-center w-full p-4 text-gray-300 hover:bg-gray-700 hover:text-white rounded-lg transition-colors ${
                  isActive ? "bg-gray-700 text-white" : ""
                }`}
                onClick={() => toggleSubmenu(item.title)}
                aria-expanded={isSubmenuOpen ? "true" : "false"}
                aria-controls={`${item.title}-submenu`}
              >
                <span className="text-lg">{item.icon}</span>
                <span className="ml-3 flex-1 text-left">{item.title}</span>
                {isSubmenuOpen ? (
                  <FaAngleUp className="text-sm" />
                ) : (
                  <FaAngleDown className="text-sm" />
                )}
              </button>
              {isSubmenuOpen && (
                <div
                  id={`${item.title}-submenu`}
                  className="ml-12 mt-2 space-y-2"
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
                          <span className="text-lg">{subItem.icon}</span>
                          <span className="ml-2">{subItem.title}</span>
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
                className={`flex items-center p-4 text-gray-300 hover:bg-gray-700 hover:text-white rounded-lg transition-colors cursor-pointer ${
                  isActive ? "bg-gray-700 text-white" : ""
                }`}
                role="menuitem"
              >
                <span className="text-lg">{item.icon}</span>
                <span className="ml-3">{item.title}</span>
              </span>
            </Link>
          )}
        </div>
      );
    });
  };

  return (
    <div className="flex">
      {/* Toggle Button for Mobile */}
      <button
        className="md:hidden text-white bg-indigo-600 p-2 rounded-full fixed top-4 left-4 z-50"
        onClick={toggleSidebar}
        aria-label="Toggle Sidebar"
      >
        {isOpen ? <FaTimes size={20} /> : <FaBars size={20} />}
      </button>

      {/* Sidebar */}
      <aside
        className={`bg-gray-800 text-white w-64 h-screen fixed top-0 left-0 z-40 transform transition-transform duration-300 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0`}
        aria-label="Sidebar"
      >
        <div className="flex items-center justify-center py-6 bg-gray-900">
          <FaUserMd size={30} className="text-indigo-500" />
          <span className="ml-3 text-2xl font-bold text-indigo-500">Hospital</span>
        </div>

        <nav className="mt-6 px-2" role="menu">
          <ul className="space-y-2">{renderNavItems(navItems)}</ul>
        </nav>

        <div className="absolute bottom-0 w-full mb-4 px-2">
          <button
            onClick={handleLogout}
            className="flex items-center w-full p-4 text-gray-300 hover:bg-gray-700 hover:text-white rounded-lg transition-colors"
            aria-label="Logout"
          >
            <FaSignOutAlt className="text-lg" />
            <span className="ml-3">Logout</span>
          </button>
        </div>
      </aside>

      {/* Overlay for Mobile when Sidebar is Open */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black opacity-50 z-30 md:hidden"
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
