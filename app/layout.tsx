"use client"; // Ensure this is a client component

import { useEffect, useState } from "react";
import localFont from "next/font/local";
import "./globals.css";
import Sidebar from "../components/Sidebar"; // Adjust this import based on your project structure
import { auth } from "../lib/firebase";
import { useRouter, usePathname } from "next/navigation";
import { onAuthStateChanged, User } from "firebase/auth";
import { getDatabase, ref, onValue } from "firebase/database"; // For reading user type from Realtime DB
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import "regenerator-runtime/runtime"; // Add this line

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Logged-in Firebase user
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  // "admin", "staff", "opd", or "ipd" (or null if not found)
  const [userType, setUserType] = useState<string | null>(null);

  const router = useRouter();
  const pathname = usePathname();

  // 1. Check if user is authenticated
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // 2. Fetch user type from Realtime Database
  useEffect(() => {
    if (user) {
      const db = getDatabase();
      const userRef = ref(db, `user/${user.uid}`); // e.g. "user/UID" => { type: "staff" }
      onValue(userRef, (snapshot) => {
        const data = snapshot.val();
        if (data && data.type) {
          setUserType(data.type);
        } else {
          setUserType(null);
        }
      });
    } else {
      setUserType(null);
    }
  }, [user]);

  // 3. Protect routes
  useEffect(() => {
    if (!loading) {
      // If user not logged in, allow only /login or /register
      if (!user) {
        const publicPaths = ["/login", "/register"];
        if (!publicPaths.includes(pathname)) {
          router.push("/login");
        }
      } else {
        // If user IS logged in and tries to go to /login or /register => push to a default page
        if (pathname === "/login" || pathname === "/register") {
          router.push("/dashboard");
        }

        // If user is "staff" and tries to go to restricted route => redirect to /opd
        if (userType === "staff") {
          const restrictedPaths = [
            "/dashboard",
            "/opdadmin",
            "/ipdadmin",
            "/patientadmin",
            "/bloodadmin",
            "/mortalityadmin",
            "/surgeryadmin",
            "/dr",
          ];
          if (restrictedPaths.includes(pathname)) {
            router.push("/opd");
          }
        }

        // ** If user is "opd", only allow /opd, /opdlist, and /addDoctor **
        if (userType === "opd") {
          const allowedPaths = ["/opd", "/opdlist", "/addDoctor"];
          // MODIFICATION: Check if pathname starts with any allowed path to handle potential sub-routes
          const isAllowed = allowedPaths.some(path => pathname.startsWith(path));
          if (!isAllowed) {
            router.push("/opd");
          }
        }

        // ** If user is "ipd", allow access to /ipd, /billing/*, and other specified pages **
        if (userType === "ipd") {
          // MODIFICATION: Changed to check if the pathname starts with an allowed base path.
          // This correctly handles all nested routes like /billing/[patientId]/[ipdId] and /billing/edit/...
          const allowedBasePaths = [
            "/ipd", 
            "/billing", 
            "/bed-management", 
            "/addDoctor",
            "/manage",
            "/discharge-summary",
            "/drugchart",
            "/ot"
          ];
          
          const isAllowed = allowedBasePaths.some(basePath => pathname.startsWith(basePath));
          
          if (!isAllowed) {
            router.push("/ipd");
          }
        }
      }
    }
  }, [user, userType, loading, pathname, router]);

  return (
    <html lang="en">
      <head>{/* Any global <head> elements */}</head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased overflow-x-hidden`}
      >
        <ToastContainer />
        {loading ? (
          <div className="flex items-center justify-center min-h-screen">
            <p>Loading...</p>
          </div>
        ) : user ? (
          <div className="flex">
            {/* Pass userType to the Sidebar */}
            <Sidebar userType={userType} />
            <main className="flex-1 ml-0 bg-gray-50 min-h-screen">
              {children}
            </main>
          </div>
        ) : (
          // Not logged in => show children (login/register)
          <>{children}</>
        )}
      </body>
    </html>
  );
}