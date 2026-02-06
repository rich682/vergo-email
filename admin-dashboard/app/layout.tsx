import type { Metadata } from "next"
import "./globals.css"
import React from "react"

export const metadata: Metadata = {
  title: "Vergo Admin",
  description: "Admin Dashboard",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-gray-950 text-gray-100 antialiased">{children}</body>
    </html>
  )
}
