// app/+html.jsx

import { ScrollViewStyleReset } from "expo-router/html";

export default function Root({ children }) {
  return (
    <html lang="zh-TW">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
        <meta name="theme-color" content="#24b9cc" />
        <link rel="manifest" href="/manifest.json" />

        <link
          rel="apple-touch-icon"
          sizes="180x180"
          href="/apple-touch-icon.png"
        />

        <link
          rel="icon"
          type="image/png"
          sizes="192x192"
          href="/icon-192.png"
        />
        {/* 允許從 iPhone 主畫面以獨立模式開啟 */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="訓練課程計畫" />
        <title>訓練課程計畫</title>
        <ScrollViewStyleReset />
        <style
          dangerouslySetInnerHTML={{
            __html: `
              html,
              body,
              #root {
                width: 100%;
                height: 100%;
                min-height: 100%;
                margin: 0;
                padding: 0;
                background-color: #ffffff;
              }

              body {
                min-height: 100vh;
                min-height: 100dvh;
                overscroll-behavior-y: none;
                -webkit-tap-highlight-color: transparent;
              }

              #root {
                min-height: 100vh;
                min-height: 100dvh;
              }
            `,
          }}
        />
      </head>

      <body>{children}</body>
    </html>
  );
}
