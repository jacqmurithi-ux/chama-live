import { supabase } from "./supabase.js";

const CATEGORIES = ["Constitution", "Forms", "Minutes", "Policies", "Other"];
const OFFICIAL_ROLES = new Set(["admin", "administrator", "chairperson", "vice chairperson", "treasurer", "secretary", "vice secretary"]);
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MIME_BY_EXTENSION = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png"
};

let context = null;
let currentUser = null;
let groupId = null;
let documents = [];
let members = [];
let meetings = [];
let selectedCategory = "All";
let busy = false;
let editingDocument = null;
let versionsByDocument = new Map();

const $ = id => document.getElementById(id);
const cleanRole = value => String(value || "").trim().toLowerCase().replace(/[_-]+/g, " ");
const isOfficial = () => OFFICIAL_ROLES.has(cleanRole(context?.member?.actual_position)) || OFFICIAL_ROLES.has(cleanRole(context?.member?.role));
const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
const formatDate = value => value ? new Intl.DateTimeFormat("en-KE",{day:"numeric",month:"short",year:"numeric"}).format(new Date(value)) : "—";
const formatSize = value => {
  const bytes = Number(value || 0);
  if (!bytes) return "Size unavailable";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
};
const isRecent = value => value && Date.now() - new Date(value).getTime() <= 7 * 86400000 && Date.now() >= new Date(value).getTime() - 60000;
const extension = name => String(name || "").split(".").pop().toLowerCase();
const fileKind = doc => {
  const ext = extension(doc.original_file_name || doc.storage_path);
  if (ext === "pdf") return ["PDF","pdf"];
  if (ext === "docx") return ["WORD","word"];
  if (ext === "xlsx") return ["XLSX","excel"];
  if (["jpg","jpeg","png"].includes(ext)) return ["IMAGE","image"];
  return ["FILE",""];
};
function showStatus(message, type = "") {
  const box = $("docsStatus");
  box.textContent = message || "";
  box.className = "docs-status" + (type ? " " + type : "");
  box.hidden = !message;
}
function showFormStatus(message, type = "") {
  const box = $("docsFormStatus");
  box.textContent = message || "";
  box.className = "docs-status" + (type ? " " + type : "");
  box.hidden = !message;
}
function displayNameFor(userId) {
  const match = members.find(member => member.user_id === userId || member.auth_user_id === userId);
  return match?.name || (userId === currentUser?.id ? context?.member?.name : null) || "Group official";
}
function documentUploader(doc) {
  return displayNameFor(doc.uploaded_by);
}
function getFilteredDocuments() {
  const query = $("docsSearch").value.trim().toLocaleLowerCase();
  return documents.filter(doc => {
    const categoryMatches = selectedCategory === "All" || doc.category === selectedCategory;
    const haystack = [doc.title, doc.description, doc.category, doc.original_file_name].join(" ").toLocaleLowerCase();
    return categoryMatches && (!query || haystack.includes(query));
  }).sort((a,b) => {
    if (a.category === "Constitution" && b.category !== "Constitution") return -1;
    if (b.category === "Constitution" && a.category !== "Constitution") return 1;
    return new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at);
  });
}
function renderChips() {
  const counts = {All:documents.length};
  for (const category of CATEGORIES) counts[category] = documents.filter(doc => doc.category === category).length;
  $("docsCategoryChips").innerHTML = ["All", ...CATEGORIES].map(category =>
    '<button type="button" class="docs-chip" data-category="' + esc(category) + '" aria-pressed="' + (selectedCategory === category) + '">' + esc(category) + '<span>' + counts[category] + '</span></button>'
  ).join("");
  $("docsCategoryChips").querySelectorAll("[data-category]").forEach(button => button.addEventListener("click", () => {
    selectedCategory = button.dataset.category;
    renderChips();
    renderDocuments();
  }));
}
function cardMarkup(doc, formOnly = false) {
  const [label, kind] = fileKind(doc);
  const recent = isRecent(doc.updated_at || doc.created_at);
  const pinned = doc.category === "Constitution";
  const description = doc.description ? '<p class="docs-description">' + esc(doc.description) + '</p>' : "";
  const versions = versionsByDocument.get(doc.id) || [];
  const versionHistory = versions.length ? '<details class="docs-more"><summary>Version history (' + versions.length + ')</summary>' + versions.map(version =>
    '<div class="docs-version"><div><strong>Version ' + version.version_number + '</strong><br><span>' + esc(formatDate(version.created_at)) + ' · ' + esc(formatSize(version.file_size)) + ' · ' + esc(displayNameFor(version.uploaded_by)) + '</span></div><button class="docs-btn" type="button" data-download-version="' + esc(version.id) + '">Download</button></div>'
  ).join("") + '</details>' : "";
  const actions = [
    '<button class="docs-btn docs-btn-primary" type="button" data-download="' + esc(doc.id) + '">↓ Download</button>'
  ];
  if (isOfficial() && !formOnly) {
    actions.push('<button class="docs-btn" type="button" data-edit="' + esc(doc.id) + '">Edit / replace</button>');
    actions.push('<button class="docs-btn" type="button" data-rename="' + esc(doc.id) + '">Rename</button>');
    actions.push('<button class="docs-btn" type="button" data-delete="' + esc(doc.id) + '">Delete</button>');
  }
  return '<article class="docs-card ' + (pinned ? 'is-constitution' : '') + '" data-doc-card="' + esc(doc.id) + '">' +
    '<div class="docs-card-head"><div class="docs-file-icon ' + kind + '" aria-hidden="true">' + label + '</div><div style="min-width:0;flex:1"><div class="docs-card-title">' + esc(doc.title) + '</div><div class="docs-tags"><span class="docs-tag">' + esc(doc.category) + '</span>' + (pinned ? '<span class="docs-tag">Pinned</span>' : '') + (recent ? '<span class="docs-new">New</span>' : '') + '</div></div></div>' +
    description +
    '<div class="docs-meta"><span>' + esc(formatSize(doc.file_size)) + '</span><span>Updated ' + esc(formatDate(doc.updated_at || doc.created_at)) + '</span><span>By ' + esc(documentUploader(doc)) + '</span>' + (doc.meeting_id ? '<span>Meeting linked</span>' : '') + '</div>' +
    '<div class="docs-actions">' + actions.join("") + '</div>' + versionHistory + '</article>';
}
function bindCardActions(container) {
  container.querySelectorAll("[data-download]").forEach(button => button.addEventListener("click", () => downloadCurrent(button.dataset.download, button)));
  container.querySelectorAll("[data-download-version]").forEach(button => button.addEventListener("click", () => downloadVersion(button.dataset.downloadVersion, button)));
  container.querySelectorAll("[data-edit]").forEach(button => button.addEventListener("click", () => openSheet(documents.find(doc => doc.id === button.dataset.edit))));
  container.querySelectorAll("[data-rename]").forEach(button => button.addEventListener("click", () => renameDocument(button.dataset.rename)));
  container.querySelectorAll("[data-delete]").forEach(button => button.addEventListener("click", () => deleteDocument(button.dataset.delete, button)));
}
function renderDocuments() {
  const filtered = getFilteredDocuments();
  const forms = filtered.filter(doc => doc.category === "Forms");
  const mainDocs = filtered.filter(doc => doc.category !== "Forms");
  $("docsCount").textContent = documents.length + (documents.length === 1 ? " document" : " documents");
  $("docsResultsCount").textContent = mainDocs.length + " shown";
  $("docsFormsCount").textContent = forms.length + " shown";
  $("docsFormsSection").hidden = !forms.length;
  $("docsFormsList").innerHTML = forms.map(doc => cardMarkup(doc, true)).join("");
  $("docsList").innerHTML = mainDocs.map(doc => cardMarkup(doc)).join("");
  $("docsList").hidden = mainDocs.length === 0;
  $("docsEmpty").hidden = filtered.length > 0;
  $("docsEmptyMessage").textContent = isOfficial()
    ? "Upload your group’s first document, constitution or blank form to get started."
    : "Your group’s documents will appear here when an authorised official shares them.";
  if (filtered.length === 0 && documents.length > 0) $("docsEmptyMessage").textContent = "No documents match your search or selected category. Try another filter.";
  bindCardActions($("docsFormsList"));
  bindCardActions($("docsList"));
  renderChips();
}
async function loadData() {
  const {data: docs, error} = await supabase.from("documents")
    .select("id,group_id,title,storage_path,uploaded_by,created_at,category,description,file_size,mime_type,meeting_id,updated_at")
    .eq("group_id", groupId)
    .order("created_at", {ascending:false});
  if (error) throw error;
  documents = (docs || []).map(doc => ({...doc, original_file_name: doc.storage_path.split("/").pop()}));
  const {data: memberRows, error: membersError} = await supabase.from("members")
    .select("id,name,user_id,auth_user_id,role,actual_position")
    .eq("group_id", groupId);
  if (!membersError) members = memberRows || [];
  const {data: meetingRows, error: meetingError} = await supabase.from("meetings")
    .select("id,title,date,status")
    .eq("group_id", groupId)
    .order("date", {ascending:false});
  if (!meetingError) meetings = meetingRows || [];
  const {data: versions, error: versionsError} = await supabase.from("document_versions")
    .select("id,document_id,group_id,version_number,title,category,description,storage_path,file_size,mime_type,uploaded_by,created_at,meeting_id")
    .eq("group_id", groupId)
    .order("version_number", {ascending:false});
  if (versionsError) console.warn("Document version history unavailable", versionsError);
  versionsByDocument = new Map();
  for (const version of versions || []) {
    const list = versionsByDocument.get(version.document_id) || [];
    list.push(version);
    versionsByDocument.set(version.document_id, list);
  }
  $("docsGroupName").textContent = context?.group?.name || context?.member?.group_name || "Your group";
  $("docsWelcome").textContent = "Documents · " + $("docsGroupName").textContent;
  $("docsMemberName").textContent = context?.member?.name || "Member";
  $("docsPosition").textContent = context?.member?.actual_position || context?.member?.role || "Member";
  $("docsUploadFab").hidden = !isOfficial();
  $("docsMeetingField").hidden = false;
  $("docsMeetingInput").innerHTML = '<option value="">Not linked to a meeting</option>' + meetings.map(meeting =>
    '<option value="' + esc(meeting.id) + '">' + esc(meeting.title) + ' · ' + esc(formatDate(meeting.date)) + '</option>'
  ).join("");
  $("docsLoading").hidden = true;
  renderDocuments();
}
async function signedUrl(path) {
  const {data,error} = await supabase.storage.from("group-documents").createSignedUrl(path, 90);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error("The download link could not be created.");
  return data.signedUrl;
}
async function downloadCurrent(id, button) {
  const doc = documents.find(item => item.id === id);
  if (!doc) return;
  button.disabled = true;
  const old = button.textContent;
  button.textContent = "Preparing…";
  try {
    const url = await signedUrl(doc.storage_path);
    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener";
    link.download = doc.original_file_name || doc.title;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } catch (error) { showStatus(error.message || "Unable to download this document.", "error"); }
  finally { button.disabled = false; button.textContent = old; }
}
async function downloadVersion(id, button) {
  const version = [...versionsByDocument.values()].flat().find(item => item.id === id);
  if (!version) return;
  button.disabled = true;
  try {
    const url = await signedUrl(version.storage_path);
    window.open(url, "_blank", "noopener");
  } catch (error) { showStatus(error.message || "Unable to download this version.", "error"); }
  finally { button.disabled = false; }
}
function openSheet(doc = null) {
  if (!isOfficial()) return;
  editingDocument = doc;
  $("docsSheetTitle").textContent = doc ? "Replace document" : "Upload document";
  $("docsSubmit").textContent = doc ? "Upload new version" : "Upload document";
  $("docsTitleInput").value = doc?.title || "";
  $("docsCategoryInput").value = doc?.category || "Other";
  $("docsDescriptionInput").value = doc?.description || "";
  $("docsMeetingInput").value = doc?.meeting_id || "";
  $("docsFileInput").value = "";
  $("docsFileInput").required = true;
  $("docsCategoryInput").disabled = Boolean(doc);
  showFormStatus("");
  $("docsSheet").hidden = false;
  document.body.style.overflow = "hidden";
  $("docsTitleInput").focus();
}
function closeSheet() {
  if (busy) return;
  $("docsSheet").hidden = true;
  document.body.style.overflow = "";
  $("docsForm").reset();
  $("docsCategoryInput").disabled = false;
  editingDocument = null;
}
function normalizeFile(file) {
  if (!file) throw new Error("Choose a file to upload.");
  if (file.size <= 0) throw new Error("The selected file is empty.");
  if (file.size > MAX_FILE_BYTES) throw new Error("Files must be 10 MB or smaller.");
  const ext = extension(file.name);
  const mime = MIME_BY_EXTENSION[ext];
  if (!mime) throw new Error("Choose a PDF, DOCX, XLSX, JPG or PNG file.");
  if (file.type && file.type !== mime && !(ext === "jpg" && file.type === "image/pjpeg")) {
    throw new Error("The selected file type does not match its extension.");
  }
  return {ext,mime};
}
async function submitDocument(event) {
  event.preventDefault();
  if (!isOfficial() || busy) return;
  const title = $("docsTitleInput").value.trim();
  const category = $("docsCategoryInput").value;
  const description = $("docsDescriptionInput").value.trim() || null;
  const meetingId = category === "Minutes" ? ($("docsMeetingInput").value || null) : null;
  const file = $("docsFileInput").files[0];
  if (!title) return showFormStatus("Enter a document title.", "error");
  if (!CATEGORIES.includes(category)) return showFormStatus("Choose a valid category.", "error");
  let fileInfo;
  try { fileInfo = normalizeFile(file); } catch (error) { return showFormStatus(error.message, "error"); }
  if (category === "Minutes" && meetingId && !meetings.some(meeting => meeting.id === meetingId)) {
    return showFormStatus("Choose a meeting from your group.", "error");
  }
  busy = true;
  $("docsSubmit").disabled = true;
  $("docsSubmit").textContent = "Uploading…";
  try {
    const docId = editingDocument?.id || crypto.randomUUID();
    const objectName = crypto.randomUUID() + "-" + file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
    const path = groupId + "/" + docId + "/" + objectName;
    const {error:uploadError} = await supabase.storage.from("group-documents").upload(path, file, {
      contentType:fileInfo.mime,
      cacheControl:"3600",
      upsert:false
    });
    if (uploadError) throw uploadError;
    const row = {
      group_id:groupId,
      title,
      storage_path:path,
      uploaded_by:currentUser.id,
      category,
      description,
      file_size:file.size,
      mime_type:fileInfo.mime,
      meeting_id:meetingId,
      created_at:new Date().toISOString(),
      updated_at:new Date().toISOString()
    };
    let result;
    if (editingDocument) {
      result = await supabase.from("documents").update(row).eq("id",editingDocument.id).eq("group_id",groupId).select("id").single();
    } else {
      result = await supabase.from("documents").insert({id:docId,...row}).select("id").single();
    }
    if (result.error) {
      await supabase.storage.from("group-documents").remove([path]);
      throw result.error;
    }
    closeSheet();
    showStatus(editingDocument ? "Document replaced. The previous file is available in Version history." : "Document uploaded. Group members have been notified.", "success");
    await loadData();
  } catch (error) {
    console.error("[CHAMA LIVE] Document upload failed", error);
    showFormStatus(error.message || "Unable to upload this document.", "error");
  } finally {
    busy = false;
    $("docsSubmit").disabled = false;
    $("docsSubmit").textContent = editingDocument ? "Upload new version" : "Upload document";
  }
}
async function renameDocument(id) {
  if (!isOfficial()) return;
  const doc = documents.find(item => item.id === id);
  if (!doc) return;
  const title = window.prompt("New document title", doc.title);
  if (title === null) return;
  const cleanTitle = title.trim();
  if (!cleanTitle || cleanTitle.length > 160) return showStatus("Enter a title between 1 and 160 characters.", "error");
  const {error} = await supabase.from("documents").update({title:cleanTitle,updated_at:new Date().toISOString()}).eq("id",id).eq("group_id",groupId);
  if (error) return showStatus(error.message || "Unable to rename this document.", "error");
  showStatus("Document renamed.", "success");
  await loadData();
}
async function deleteDocument(id, button) {
  if (!isOfficial()) return;
  const doc = documents.find(item => item.id === id);
  if (!doc || !window.confirm('Delete "' + doc.title + '" and its version history? This cannot be undone.')) return;
  button.disabled = true;
  try {
    const versions = versionsByDocument.get(id) || [];
    const paths = [doc.storage_path, ...versions.map(version => version.storage_path)];
    const {error:storageError} = await supabase.storage.from("group-documents").remove(paths);
    if (storageError) throw storageError;
    const {error} = await supabase.from("documents").delete().eq("id",id).eq("group_id",groupId);
    if (error) throw error;
    showStatus("Document and version history deleted.", "success");
    await loadData();
  } catch (error) {
    showStatus(error.message || "Unable to delete this document.", "error");
  } finally { button.disabled = false; }
}
function bindEvents() {
  $("docsUploadFab").addEventListener("click", () => openSheet());
  $("docsCloseSheet").addEventListener("click", closeSheet);
  $("docsCancel").addEventListener("click", closeSheet);
  $("docsSheet").addEventListener("click", event => { if (event.target === $("docsSheet")) closeSheet(); });
  $("docsCategoryInput").addEventListener("change", () => {
    $("docsMeetingField").hidden = $("docsCategoryInput").value !== "Minutes";
  });
  $("docsSearch").addEventListener("input", renderDocuments);
  $("docsForm").addEventListener("submit", submitDocument);
  document.addEventListener("keydown", event => { if (event.key === "Escape" && !$("docsSheet").hidden) closeSheet(); });
}
export async function initDocuments(pageContext = null) {
  context = pageContext;
  if (!context?.member?.group_id || !context?.member?.id) {
    throw new Error("Your group membership could not be verified. Please sign in again.");
  }
  groupId = context.member.group_id;
  const {data,error} = await supabase.auth.getUser();
  if (error || !data?.user) throw new Error("Please sign in again to view group documents.");
  currentUser = data.user;
  bindEvents();
  if (isOfficial()) $("docsUploadFab").hidden = false;
  try {
    await loadData();
    $("docsLoading").hidden = true;
  } catch (error) {
    $("docsLoading").hidden = true;
    showStatus("Documents could not be loaded. Refresh the page to try again.", "error");
    throw error;
  }
}
