import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import React from "react";

const GTAG_ID = "AW-331832925";

const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Vergo",
  description: "AI-Powered Accounting Execution Platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${inter.className}`}>
        <Script src={`https://www.googletagmanager.com/gtag/js?id=${GTAG_ID}`} strategy="afterInteractive" />
        <Script id="gtag-init" strategy="afterInteractive">
          {`window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GTAG_ID}');`}
        </Script>
        {children}
        {/* Global error handler for uncaught errors */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                var reported = {};
                function reportError(msg, stack, severity) {
                  var key = msg + (stack || '').substring(0, 100);
                  if (reported[key]) return;
                  reported[key] = true;
                  try {
                    fetch('/api/errors/report', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        errorMessage: (msg || 'Unknown error').substring(0, 2000),
                        errorStack: (stack || '').substring(0, 5000),
                        componentName: 'GlobalHandler',
                        pageUrl: window.location.href,
                        severity: severity || 'error'
                      })
                    }).catch(function() {});
                  } catch(e) {}
                }
                window.onerror = function(msg, src, line, col, err) {
                  reportError(String(msg), err && err.stack ? err.stack : src + ':' + line + ':' + col, 'error');
                };
                window.onunhandledrejection = function(e) {
                  var msg = e.reason ? (e.reason.message || String(e.reason)) : 'Unhandled promise rejection';
                  var stack = e.reason && e.reason.stack ? e.reason.stack : '';
                  reportError(msg, stack, 'error');
                };
              })();
            `,
          }}
        />
      </body>
    </html>
  );
}

