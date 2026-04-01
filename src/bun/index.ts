import { ApplicationMenu, BrowserWindow } from "electrobun/bun";
import { initializeDatabase } from "./db/database";
import { createRPC } from "./rpc";
import { createLogger } from "./utils/logger";

const log = createLogger("app");

// HMR: use Vite dev server if running, otherwise use bundled views
async function getMainViewUrl(): Promise<string> {
  try {
    const response = await fetch("http://localhost:5173");
    if (response.ok) {
      return "http://localhost:5173";
    }
  } catch {
    // Vite dev server not running, use bundled views
  }
  return "views://mainview/index.html";
}

async function bootstrap(): Promise<void> {
  try {
    await initializeDatabase();
  } catch (error) {
    const message =
      error instanceof Error ? (error.stack ?? error.message) : String(error);
    log.error(`Failed to initialize database: ${message}`);
    process.exit(1);
  }

  ApplicationMenu.setApplicationMenu([
    {
      submenu: [
        { label: "About piloto", role: "about" },
        { type: "separator" },
        { label: "Quit", role: "quit", accelerator: "q" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
  ]);

  const mainRPC = createRPC();
  const mainWindow = new BrowserWindow({
    title: "piloto",
    url: await getMainViewUrl(),
    frame: {
      width: 1200,
      height: 800,
      x: 100,
      y: 100,
    },
    rpc: mainRPC,
  });

  mainWindow.on("close", () => {
    log.info("Main window closed");
    process.exit(0);
  });

  mainWindow.webview.on("dom-ready", () => {
    log.info("Webview DOM ready");
  });

  log.info("piloto app started");
}

await bootstrap();
