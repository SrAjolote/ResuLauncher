"use strict";
const electron = require("electron");
const api = {
  platform: process.platform,
  minimize: () => electron.ipcRenderer.send("window:minimize"),
  close: () => electron.ipcRenderer.send("window:close"),
  openGameFolder: () => electron.ipcRenderer.send("app:open-folder"),
  getVersion: () => electron.ipcRenderer.invoke("app:version"),
  // Últimas líneas del log del juego (visor / diagnóstico de crashes).
  readGameLog: () => electron.ipcRenderer.invoke("app:read-log"),
  auth: {
    get: () => electron.ipcRenderer.invoke("auth:get"),
    loginPirata: (username) => electron.ipcRenderer.invoke("auth:login-pirata", username),
    loginPremium: () => electron.ipcRenderer.invoke("auth:login-premium"),
    logout: () => electron.ipcRenderer.invoke("auth:logout"),
    // Suscripción al device code durante el login premium. Devuelve una función para desuscribir.
    onDeviceCode: (cb) => {
      const listener = (_e, info) => cb(info);
      electron.ipcRenderer.on("auth:device-code", listener);
      return () => electron.ipcRenderer.removeListener("auth:device-code", listener);
    }
  },
  sync: {
    start: () => electron.ipcRenderer.invoke("sync:start"),
    cancel: () => electron.ipcRenderer.invoke("sync:cancel"),
    // Progreso de la sincronización. Devuelve una función para desuscribir.
    onProgress: (cb) => {
      const listener = (_e, p) => cb(p);
      electron.ipcRenderer.on("sync:progress", listener);
      return () => electron.ipcRenderer.removeListener("sync:progress", listener);
    }
  },
  java: {
    get: () => electron.ipcRenderer.invoke("java:get"),
    ensure: () => electron.ipcRenderer.invoke("java:ensure"),
    onProgress: (cb) => {
      const listener = (_e, p) => cb(p);
      electron.ipcRenderer.on("java:progress", listener);
      return () => electron.ipcRenderer.removeListener("java:progress", listener);
    }
  },
  launch: {
    start: () => electron.ipcRenderer.invoke("launch:start"),
    onProgress: (cb) => {
      const listener = (_e, p) => cb(p);
      electron.ipcRenderer.on("launch:progress", listener);
      return () => electron.ipcRenderer.removeListener("launch:progress", listener);
    },
    onStatus: (cb) => {
      const listener = (_e, s) => cb(s);
      electron.ipcRenderer.on("launch:status", listener);
      return () => electron.ipcRenderer.removeListener("launch:status", listener);
    }
  },
  settings: {
    get: () => electron.ipcRenderer.invoke("settings:get"),
    limits: () => electron.ipcRenderer.invoke("settings:limits"),
    set: (patch) => electron.ipcRenderer.invoke("settings:set", patch)
  },
  status: {
    ping: () => electron.ipcRenderer.invoke("status:ping")
  },
  update: {
    check: () => electron.ipcRenderer.invoke("update:check"),
    install: () => electron.ipcRenderer.invoke("update:install"),
    onStatus: (cb) => {
      const listener = (_e, s) => cb(s);
      electron.ipcRenderer.on("update:status", listener);
      return () => electron.ipcRenderer.removeListener("update:status", listener);
    }
  },
  fuse: {
    status: () => electron.ipcRenderer.invoke("fuse:status"),
    install: () => electron.ipcRenderer.invoke("fuse:install")
  },
  idioma: {
    get: () => electron.ipcRenderer.invoke("idioma:get"),
    set: (lang) => electron.ipcRenderer.invoke("idioma:set", lang)
  },
  perf: {
    // ¿Proponer pasar a Lite? (hardware justo o marca del juego)
    check: () => electron.ipcRenderer.invoke("perf:check"),
    answer: (accept) => electron.ipcRenderer.invoke("perf:answer", accept)
  }
};
if (process.contextIsolated) {
  try {
    electron.contextBridge.exposeInMainWorld("dbr", api);
  } catch (error) {
    console.error(error);
  }
} else {
  window.dbr = api;
}
