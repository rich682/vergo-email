import Script from "next/script"

const GTAG_ID = "AW-331832925"

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${GTAG_ID}`} strategy="afterInteractive" />
      <Script id="gtag-init" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${GTAG_ID}');`}
      </Script>
      {children}
    </>
  )
}
