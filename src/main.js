import {
  render,
  card,
  dropZone,
  fileInput,
  fileList,
  unlockBtn,
  passwordInput,
} from "./render.js";
import { addFiles, removeEntry, unlockWithPassword } from "./unlock.js";

/* ---------------- processing ---------------- */

function enqueue(task) {
  queue.push(task);
  pump();
}

async function pump() {
  if (processing) return;
  processing = true;
  render();

  while (queue.length > 0) {
    const task = queue.shift();
    try {
      await task();
    } catch (err) {
      console.error(err);
    }
  }

  processing = false;
  render();
}

function triggerDownload(entry) {
  const link = document.createElement("a");
  link.href = entry.downloadUrl;
  link.download = entry.outName;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function clearDownload(entry) {
  if (entry.downloadUrl) {
    URL.revokeObjectURL(entry.downloadUrl);
    entry.downloadUrl = null;
    entry.outName = "";
  }
}

async function checkAndUnlock(entry) {
  entry.status = "checking";
  entry.detail = "Checking…";
  entry.permissions = {};
  render();

  let lines;
  try {
    entry.bytes = new Uint8Array(await entry.file.arrayBuffer());
    const result = await runQpdf(entry.bytes, [
      "--show-encryption",
      "/input.pdf",
    ]);
    lines = result.lines;

    if (result.exitCode !== 0 && lines.some((l) => /password/i.test(l))) {
      entry.status = "password";
      entry.detail = "Password-protected";
      render();
      return;
    }

    if (lines.some((l) => l.includes("not encrypted"))) {
      entry.status = "unencrypted";
      entry.detail = "Not encrypted — nothing to do";
      render();
      return;
    }

    entry.permissions = Object.fromEntries(
      lines
        .map((l) => l.match(/^(.+?)\s*[=:]\s*(.*)$/))
        .filter(Boolean)
        .map((m) => [m[1].trim(), m[2].trim()]),
    );
  } catch (err) {
    entry.status = "error";
    entry.detail = err.message || "Could not read file";
    render();
    return;
  }

  // Encrypted without a user password: unlock it straight away.
  await decrypt(entry, "");
}

async function decrypt(entry, password) {
  entry.detail = "Decrypting…";
  entry.status = "checking";
  render();

  try {
    const args = ["--decrypt", "/input.pdf", "/output.pdf"];
    if (password) args.unshift("--password=" + password);

    const { exitCode, lines, instance } = await runQpdf(entry.bytes, args);

    if (exitCode !== 0 && exitCode !== 3) {
      throw new Error(
        lines.join("\n").trim() || `qpdf exited with code ${exitCode}`,
      );
    }

    const output = instance.FS.readFile("/output.pdf");
    if (!output || output.length === 0) {
      throw new Error("qpdf produced an empty file");
    }

    clearDownload(entry);
    entry.outName = entry.file.name.replace(/\.pdf$/i, "") + "_unlocked.pdf";
    entry.downloadUrl = URL.createObjectURL(
      new Blob([output], { type: "application/pdf" }),
    );
    entry.status = "unlocked";
    entry.detail = "Unlocked";
    autoDownloads.push(entry);
  } catch (err) {
    entry.status = password ? "password" : "error";
    entry.detail = err.message || "Decryption failed";
  }

  render();

  // Download outside the render pass so the link also exists in the list.
  for (const done of autoDownloads.splice(0)) triggerDownload(done);
}

/* ---------------- file intake ---------------- */

function addFiles(fileListLike) {
  const incoming = Array.from(fileListLike);
  if (incoming.length === 0) return;

  const rejected = [];
  const added = [];

  for (const file of incoming) {
    const isPdf =
      file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    if (!isPdf) {
      rejected.push(file.name);
      continue;
    }
    const duplicate = entries.some(
      (e) => e.file.name === file.name && e.file.size === file.size,
    );
    if (duplicate) continue;

    const entry = {
      id: nextId++,
      file,
      bytes: null,
      status: "checking",
      detail: "Queued…",
      permissions: {},
      downloadUrl: null,
      outName: "",
    };
    entries.push(entry);
    added.push(entry);
  }

  render();

  if (rejected.length > 0) {
    setStatus(
      `Skipped ${rejected.length} non-PDF file${rejected.length > 1 ? "s" : ""}.`,
      "error",
    );
  }

  for (const entry of added) {
    enqueue(() => checkAndUnlock(entry));
  }
}

function removeEntry(id) {
  const index = entries.findIndex((e) => e.id === id);
  if (index === -1) return;
  const [entry] = entries.splice(index, 1);
  clearDownload(entry);
  render();
}

function unlockWithPassword() {
  const pending = entries.filter((e) => e.status === "password");
  if (pending.length === 0) return;
  const password = passwordInput.value;
  for (const entry of pending) {
    enqueue(() => decrypt(entry, password));
  }
}

/* ---------------- events ---------------- */

dropZone.addEventListener("click", () => fileInput.click());

// Rows are re-rendered wholesale, so removal is delegated to the container.
fileList.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-remove]");
  if (!btn) return;
  e.stopPropagation();
  removeEntry(Number(btn.dataset.remove));
});

// The whole card accepts drops so a new batch never needs precise aim.
card.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("dragover");
});

card.addEventListener("dragleave", (e) => {
  // dragleave also fires when moving between children; only react on leaving the card.
  if (!card.contains(e.relatedTarget)) dropZone.classList.remove("dragover");
});

card.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("dragover");
  if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
});

fileInput.addEventListener("change", () => {
  if (fileInput.files?.length) addFiles(fileInput.files);
  // Reset so picking the same file again still fires `change`.
  fileInput.value = "";
});

unlockBtn.addEventListener("click", unlockWithPassword);
passwordInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") unlockWithPassword();
});

render();
