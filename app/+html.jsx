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
        <meta name="background-color" content="#ffffff" />
        {/* 連結 PWA Manifest */}
        /manifest.json
        {/* iPhone 與 iPad 主畫面圖示 */}
        /apple-touch-icon.png
        {/* 允許從 iOS 主畫面以獨立 App 模式開啟 */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        {/* 其他行動瀏覽器的獨立 App 模式 */}
        <meta name="mobile-web-app-capable" content="yes" />
        {/* iPhone 狀態列顯示方式 */}
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        {/* iPhone 主畫面 App 名稱 */}
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
                min-height: 100%;
                margin: 0;
                padding: 0;
                background-color: #ffffff;
              }

              html {
                height: 100%;
              }

              body {
                min-height: 100vh;
                min-height: 100dvh;
                overscroll-behavior-y: none;
                -webkit-tap-highlight-color: transparent;
                -webkit-touch-callout: none;
              }

              #root {
                min-height: 100vh;
                min-height: 100dvh;
              }

              @supports (padding: env(safe-area-inset-top)) {
                body {
                  min-height: calc(
                    100vh +
                    env(safe-area-inset-top) +
                    env(safe-area-inset-bottom)
                  );
                }
              }
            `,
          }}
        />
      </head>

      <body>{children}</body>
    </html>
  );
}
