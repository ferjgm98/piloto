import { ApplicationMenu, BrowserWindow } from "electrobun/bun";
import { createRPC } from "./rpc";
import { createLogger } from "./utils/logger";

// Initialize database on startup
import "./db/database";

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

// Application menu
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

// Define RPC handlers for webview communication
const mainRPC = createRPC();

// Create main window
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

// Handle window events
mainWindow.on("close", () => {
  log.info("Main window closed");
  process.exit(0);
});

mainWindow.webview.on("dom-ready", () => {
  log.info("Webview DOM ready");
});

log.info("piloto app started");
