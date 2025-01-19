"use client"; // Ensure this is a client component

import { useEffect, useState } from "react";
import localFont from "next/font/local";
import "./globals.css";
import Sidebar from "../components/Sidebar"; // Adjust this import based on your project structure
import { auth } from "../lib/firebase";
import { useRouter, usePathname } from "next/navigation";
import { onAuthStateChanged, User } from "firebase/auth"; // Import User type
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import 'regenerator-runtime/runtime'; // Add this line

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
  const [user, setUser] = useState<User | null>(null); // Specify the type for user
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false); // Set loading to false once we have auth state
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!loading) {
      if (user) {
        // If user is logged in, prevent access to login/register
        if (pathname === "/login" || pathname === "/register") {
          router.push("/dashboard"); // Redirect to dashboard or home if trying to access login/register
        }
      } else {
        // If not logged in, restrict access to protected routes
        const publicPaths = ["/login", "/register"];
        const isPublicPath = publicPaths.includes(pathname);
        if (!isPublicPath) {
          router.push("/login");
        }
      }
    }
  }, [user, loading, pathname, router]);

  return (
    <html lang="en">
      <head>
        {/* Add any global head elements here */}
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased overflow-x-hidden`}
      >
        <ToastContainer />
        {loading ? (
          // Display loading if still checking auth state
          <div className="flex items-center justify-center min-h-screen">
            <p>Loading...</p>
          </div>
        ) : user ? (
          <div className="flex">
            <Sidebar />
            <main className="flex-1 ml-0 bg-gray-50 min-h-screen">
              {children}
            </main>
          </div>
        ) : (
          // Render children if not logged in (login/register)
          <>{children}</>
        )}
      </body>
    </html>
  );
}
