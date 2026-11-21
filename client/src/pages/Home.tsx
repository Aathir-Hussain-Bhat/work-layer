import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  Check,
  ChevronDown,
  CircleHelp,
  Command,
  Copy,
  Download,
  FileText,
  FolderOpen,
  Globe2,
  ImagePlus,
  Inbox,
  Layers3,
  Link2,
  Menu,
  Pencil,
  PenLine,
  Plus,
  Search,
  Send,
  Tag,
  Trash2,
  UserRound,
  X,
} from "lucide-react";

type Section = "home" | "inbox" | "spaces" | "notes" | "links";
type Space = { id: string; name: string; createdAt: string };
type UserProfile = { displayName: string };
type ImageAttachment = { id: string; name: string; dataUrl: string };
type SavedItem = {
  id: string;
  title: string;
  content: string;
  type: "note" | "link";
  url?: string;
  spaceId?: string;
  tags?: string[];
  images?: ImageAttachment[];
  createdAt: string;
};
type WorkspaceData = { profile: UserProfile; spaces: Space[]; items: SavedItem[] };
type Dialog = { type: "profile" } | { type: "space" } | { type: "link" } | { type: "item"; itemId: string } | { type: "edit"; itemId: string } | null;

const STORAGE_KEY = "layer-workspace-local-v2";
const MAX_IMAGES_PER_ITEM = 4;
const MAX_IMAGE_DATA_CHARS = 480_000;
const MAX_WORKSPACE_IMAGE_CHARS = 1_200_000;
const NAV: { id: Section; label: string; icon: typeof Inbox }[] = [
  { id: "home", label: "Home", icon: FolderOpen },
  { id: "inbox", label: "Inbox", icon: Inbox },
  { id: "spaces", label: "Spaces", icon: Layers3 },
  { id: "notes", label: "Notes", icon: FileText },
  { id: "links", label: "Links", icon: Link2 },
];

function loadWorkspace(): WorkspaceData {
  if (typeof window === "undefined") return { profile: { displayName: "" }, spaces: [], items: [] };
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return { profile: { displayName: "" }, spaces: [], items: [] };
    const parsed = JSON.parse(saved) as Partial<WorkspaceData>;
    return {
      profile: { displayName: typeof parsed.profile?.displayName === "string" ? parsed.profile.displayName : "" },
      spaces: Array.isArray(parsed.spaces) ? parsed.spaces : [],
      items: Array.isArray(parsed.items) ? parsed.items.map((item) => ({
        ...item,
        tags: Array.isArray(item.tags) ? normalizeTags(item.tags) : [],
        images: Array.isArray(item.images) ? item.images.filter((image) => typeof image?.id === "string" && typeof image?.name === "string" && typeof image?.dataUrl === "string" && image.dataUrl.startsWith("data:image/")) : [],
      })) : [],
    };
  } catch {
    return { profile: { displayName: "" }, spaces: [], items: [] };
  }
}

function getInitials(name: string) {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) {
    return `Today, ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  }
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function getLinkTitle(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Saved link";
  }
}

function normalizeTags(value: string | readonly string[]) {
  const entries = typeof value === "string" ? value.split(/[\n,]/) : value;
  const seen = new Set<string>();
  return entries.map((tag) => tag.trim().replace(/^#+/, "").slice(0, 24)).filter((tag) => {
    const key = tag.toLocaleLowerCase();
    if (!tag || seen.has(key) || seen.size >= 8) return false;
    seen.add(key);
    return true;
  });
}

async function compressImage(file: File): Promise<ImageAttachment> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");
  const bitmap = await createImageBitmap(file);
  try {
    let maxDimension = 1400;
    let quality = 0.78;
    for (let attempt = 0; attempt < 7; attempt += 1) {
      const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("This image could not be prepared.");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      if (dataUrl.length <= MAX_IMAGE_DATA_CHARS) {
        const name = file.name.replace(/\.[^.]+$/, "") || "Image";
        return { id: crypto.randomUUID(), name, dataUrl };
      }
      maxDimension *= 0.82;
      quality = Math.max(0.48, quality - 0.06);
    }
    throw new Error("That image is too large to keep on this device.");
  } finally {
    bitmap.close();
  }
}

export default function Home() {
  const [workspace, setWorkspace] = useState<WorkspaceData>(loadWorkspace);
  const [section, setSection] = useState<Section>("home");
  const [capture, setCapture] = useState("");
  const [captureTags, setCaptureTags] = useState("");
  const [captureImages, setCaptureImages] = useState<ImageAttachment[]>([]);
  const [imagesProcessing, setImagesProcessing] = useState(false);
  const [captureSpace, setCaptureSpace] = useState("");
  const [selectedSpace, setSelectedSpace] = useState<string | null>(null);
  const [selectedTag, setSelectedTag] = useState("");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [spaceName, setSpaceName] = useState("");
  const [profileNameDraft, setProfileNameDraft] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkTitle, setLinkTitle] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editSpace, setEditSpace] = useState("");
  const [editTags, setEditTags] = useState("");
  const [editImages, setEditImages] = useState<ImageAttachment[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installVisible, setInstallVisible] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
    } catch {
      toast.error("Could not save on this device", { description: "Check your browser storage settings." });
    }
  }, [workspace]);

  useEffect(() => {
    const handleBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
      setInstallVisible(true);
    };
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (event.key === "Escape") {
        setSearchOpen(false);
        setDialog(null);
        setMobileNavOpen(false);
      }
    };
    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    window.addEventListener("keydown", handleShortcut);
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register(`${import.meta.env.BASE_URL}service-worker.js`).catch(() => undefined);
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window.removeEventListener("keydown", handleShortcut);
    };
  }, []);

  useEffect(() => {
    if (searchOpen) window.setTimeout(() => searchRef.current?.focus(), 30);
  }, [searchOpen]);

  const currentSpace = workspace.spaces.find((space) => space.id === selectedSpace);
  const selectedItem = dialog?.type === "item" ? workspace.items.find((item) => item.id === dialog.itemId) : undefined;
  const editingItem = dialog?.type === "edit" ? workspace.items.find((item) => item.id === dialog.itemId) : undefined;
  const heading = section === "spaces" && currentSpace ? currentSpace.name : NAV.find((item) => item.id === section)?.label ?? "Home";
  const visibleItems = useMemo(() => {
    let items = workspace.items;
    if (section === "inbox") items = items.filter((item) => !item.spaceId);
    if (section === "notes") items = items.filter((item) => item.type === "note");
    if (section === "links") items = items.filter((item) => item.type === "link");
    if (section === "spaces" && currentSpace) items = items.filter((item) => item.spaceId === currentSpace.id);
    return selectedTag ? items.filter((item) => item.tags?.some((tag) => tag.toLocaleLowerCase() === selectedTag.toLocaleLowerCase())) : items;
  }, [section, workspace.items, currentSpace, selectedTag]);
  const availableTags = useMemo(() => Array.from(new Set(workspace.items.flatMap((item) => item.tags ?? []))).sort((a, b) => a.localeCompare(b)), [workspace.items]);
  const recentItems = [...workspace.items].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 4);
  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return { items: workspace.items.slice(0, 5), spaces: workspace.spaces.slice(0, 3) };
    return {
      items: workspace.items.filter((item) => `${item.title} ${item.content} ${item.url ?? ""} ${(item.tags ?? []).join(" ")}`.toLowerCase().includes(query)).slice(0, 8),
      spaces: workspace.spaces.filter((space) => space.name.toLowerCase().includes(query)).slice(0, 5),
    };
  }, [searchQuery, workspace.items, workspace.spaces]);

  const goTo = (next: Section) => {
    setSection(next);
    setSelectedSpace(null);
    setMobileNavOpen(false);
    if (next !== "home") setCaptureSpace("");
  };

  const addItem = (item: Omit<SavedItem, "id" | "createdAt">) => {
    const next: SavedItem = { ...item, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
    const updated = { ...workspace, items: [next, ...workspace.items] };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {
      toast.error("Could not save on this device", { description: "Your browser storage may be full. Remove an attachment or free up space, then try again." });
      return false;
    }
    setWorkspace(updated);
    toast.success(item.type === "link" ? "Link saved" : "Thought saved", { description: item.title });
    return true;
  };

  const attachImages = async (event: ChangeEvent<HTMLInputElement>, currentImages: ImageAttachment[], onChange: (images: ImageAttachment[]) => void, replacingItemId?: string) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length) return;
    if (imagesProcessing) return;
    setImagesProcessing(true);
    const otherImageChars = workspace.items.filter((item) => item.id !== replacingItemId).reduce((total, item) => total + (item.images ?? []).reduce((sum, image) => sum + image.dataUrl.length, 0), 0);
    const next = [...currentImages];
    let usedImageChars = otherImageChars + next.reduce((total, image) => total + image.dataUrl.length, 0);
    let added = 0;
    for (const file of files) {
      if (next.length >= MAX_IMAGES_PER_ITEM) {
        toast.error(`Keep up to ${MAX_IMAGES_PER_ITEM} images with one item.`);
        break;
      }
      try {
        const image = await compressImage(file);
        if (usedImageChars + image.dataUrl.length > MAX_WORKSPACE_IMAGE_CHARS) {
          toast.error("Your local image space is full", { description: "Remove an old attachment before adding another." });
          break;
        }
        next.push(image);
        usedImageChars += image.dataUrl.length;
        added += 1;
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "That image could not be attached.");
      }
    }
    if (added) {
      onChange(next);
      toast.success(added === 1 ? "Image ready" : `${added} images ready`, { description: "Compressed on this device. Save the item to keep it." });
    }
    setImagesProcessing(false);
  };

  const openEditor = (item: SavedItem) => {
    setEditTitle(item.title);
    setEditContent(item.type === "link" ? item.url ?? item.content : item.content);
    setEditSpace(item.spaceId ?? "");
    setEditTags((item.tags ?? []).join(", "));
    setEditImages(item.images ?? []);
    setDialog({ type: "edit", itemId: item.id });
  };

  const copyItem = async (item: SavedItem) => {
    const text = item.type === "link" ? item.url ?? item.content : item.content || item.title;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const input = document.createElement("textarea");
      input.value = text;
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.appendChild(input);
      input.select();
      const copied = document.execCommand("copy");
      input.remove();
      if (!copied) {
        toast.error("Could not copy this item");
        return;
      }
    }
    toast.success(item.type === "link" ? "Link copied" : "Note copied");
  };

  const saveCapture = (event?: FormEvent) => {
    event?.preventDefault();
    if (imagesProcessing) return;
    const value = capture.trim();
    if (!value && !captureImages.length) {
      toast("Write a thought to save", { description: "Your captures stay on this device." });
      return;
    }
    let parsedUrl: URL | null = null;
    try {
      parsedUrl = new URL(value);
      if (!/^https?:$/.test(parsedUrl.protocol)) parsedUrl = null;
    } catch {
      parsedUrl = null;
    }
    const tags = normalizeTags(captureTags);
    const saved = addItem(parsedUrl
      ? { title: getLinkTitle(parsedUrl.toString()), content: parsedUrl.toString(), url: parsedUrl.toString(), type: "link", spaceId: captureSpace || undefined, tags, images: captureImages }
      : { title: value.split("\n")[0].slice(0, 72) || captureImages[0]?.name || "Image note", content: value, type: "note", spaceId: captureSpace || undefined, tags, images: captureImages });
    if (!saved) return;
    setCapture("");
    setCaptureTags("");
    setCaptureImages([]);
  };

  const createSpace = (event: FormEvent) => {
    event.preventDefault();
    const name = spaceName.trim();
    if (!name) return;
    const space = { id: crypto.randomUUID(), name, createdAt: new Date().toISOString() };
    setWorkspace((current) => ({ ...current, spaces: [space, ...current.spaces] }));
    setSpaceName("");
    setDialog(null);
    setSection("spaces");
    setSelectedSpace(space.id);
    toast.success("Space created", { description: name });
  };

  const saveProfile = (event: FormEvent) => {
    event.preventDefault();
    const displayName = profileNameDraft.trim().slice(0, 48);
    setWorkspace((current) => ({ ...current, profile: { displayName } }));
    setDialog(null);
    toast.success(displayName ? "Profile saved" : "Profile name cleared");
  };

  const saveLink = (event: FormEvent) => {
    event.preventDefault();
    const raw = linkUrl.trim();
    if (!raw) return;
    let parsed: URL;
    try {
      parsed = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
      if (!/^https?:$/.test(parsed.protocol)) throw new Error("Invalid URL");
    } catch {
      toast.error("Enter a valid web address");
      return;
    }
    if (!addItem({ title: linkTitle.trim() || getLinkTitle(parsed.toString()), content: parsed.toString(), url: parsed.toString(), type: "link", spaceId: captureSpace || undefined })) return;
    setLinkUrl("");
    setLinkTitle("");
    setDialog(null);
  };

  const saveEditedItem = (event: FormEvent) => {
    event.preventDefault();
    if (!editingItem || imagesProcessing) return;
    let content = editContent;
    let url: string | undefined;
    if (editingItem.type === "link") {
      try {
        const parsed = new URL(/^https?:\/\//i.test(editContent.trim()) ? editContent.trim() : `https://${editContent.trim()}`);
        if (!/^https?:$/.test(parsed.protocol)) throw new Error("Invalid URL");
        url = parsed.toString();
        content = url;
      } catch {
        toast.error("Enter a valid web address");
        return;
      }
    }
    const title = editTitle.trim().slice(0, 72) || (url ? getLinkTitle(url) : content.split("\n")[0].slice(0, 72) || editImages[0]?.name || "Image note");
    const updated: SavedItem = {
      ...editingItem,
      title,
      content,
      url,
      spaceId: editSpace || undefined,
      tags: normalizeTags(editTags),
      images: editImages,
    };
    const nextWorkspace = { ...workspace, items: workspace.items.map((item) => item.id === updated.id ? updated : item) };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextWorkspace));
    } catch {
      toast.error("Could not save on this device", { description: "Your browser storage may be full. Remove an attachment or free up space, then try again." });
      return;
    }
    setWorkspace(nextWorkspace);
    setDialog({ type: "item", itemId: updated.id });
    toast.success("Changes saved", { description: title });
  };

  const deleteItem = (id: string) => {
    setWorkspace((current) => ({ ...current, items: current.items.filter((item) => item.id !== id) }));
    setDialog(null);
    toast.success("Removed from your workspace");
  };

  const deleteSpace = (id: string) => {
    const space = workspace.spaces.find((item) => item.id === id);
    setWorkspace((current) => ({
      profile: current.profile,
      spaces: current.spaces.filter((item) => item.id !== id),
      items: current.items.map((item) => item.spaceId === id ? { ...item, spaceId: undefined } : item),
    }));
    setSelectedSpace(null);
    setSection("spaces");
    if (space) toast("Space removed", { description: "Its captures were moved back to your inbox." });
  };

  const exportBackup = () => {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), ...workspace }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `layer-backup-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success("Backup downloaded");
  };

  const chooseSpace = (spaceId: string) => {
    setSelectedSpace(spaceId);
    setSection("spaces");
  };

  const installApp = async () => {
    if (!installEvent) {
      toast("Install from your browser menu", { description: "Choose ‘Add to Home Screen’ or ‘Install app’." });
      return;
    }
    await installEvent.prompt();
    setInstallVisible(false);
    setInstallEvent(null);
  };

  const renderItem = (item: SavedItem) => {
    const spaceName = workspace.spaces.find((space) => space.id === item.spaceId)?.name;
    const Icon = item.type === "link" ? Globe2 : FileText;
    return (
      <button className="saved-item" key={item.id} onClick={() => setDialog({ type: "item", itemId: item.id })}>
        {item.images?.[0] ? <img className="saved-item-image" src={item.images[0].dataUrl} alt="" /> : <span className={`saved-item-icon ${item.type === "link" ? "link-icon" : "note-icon"}`}><Icon size={17} /></span>}
        <span className="saved-item-copy">
          <strong>{item.title}</strong>
          <span>{item.type === "link" ? item.url : item.content || `${item.images?.length ?? 0} attached image${item.images?.length === 1 ? "" : "s"}`}</span>
          {!!item.tags?.length && <span className="item-tags">{item.tags.map((tag) => <span className="item-tag" key={tag}>{tag}</span>)}</span>}
          <small>{spaceName ? `${spaceName} · ` : "Inbox · "}{formatDate(item.createdAt)}</small>
        </span>
        <ArrowUpRight size={16} className="saved-item-arrow" />
      </button>
    );
  };

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNavOpen ? "sidebar-open" : ""}`} aria-label="Workspace navigation">
        <div className="sidebar-brand-row">
          <a className="brand" href="#home" onClick={() => goTo("home")} aria-label="Work Layer home">
            <span className="brand-mark"><Layers3 size={17} strokeWidth={2.2} /></span><span>work layer</span>
          </a>
          <button className="icon-button close-nav" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation"><X size={18} /></button>
        </div>
        <button type="button" className="workspace-label" onClick={() => { setProfileNameDraft(workspace.profile.displayName); setDialog({ type: "profile" }); setMobileNavOpen(false); }} aria-label={workspace.profile.displayName ? `Edit profile for ${workspace.profile.displayName}` : "Add a name (if you like)"}>
          <span className="workspace-avatar">{workspace.profile.displayName ? getInitials(workspace.profile.displayName) : <UserRound size={16} />}</span>
          <span><small>JUST THIS BROWSER</small><strong>{workspace.profile.displayName || "Add your name (optional)"}</strong></span>
          <ChevronDown size={15} />
        </button>
        <nav className="nav-list" aria-label="Main menu">
          <span className="nav-caption">YOUR DESK</span>
          {NAV.map(({ id, label, icon: Icon }) => (
            <button className={`nav-item ${section === id ? "nav-item-active" : ""}`} key={id} onClick={() => goTo(id)}>
              <Icon size={18} strokeWidth={1.8} /><span>{label}</span>
              {id === "inbox" && workspace.items.filter((item) => !item.spaceId).length > 0 && <span className="nav-count">{workspace.items.filter((item) => !item.spaceId).length}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-spaces">
          <div className="side-spaces-heading"><span className="nav-caption">SPACES</span><button className="tiny-plus" onClick={() => setDialog({ type: "space" })} aria-label="Create space"><Plus size={15} /></button></div>
          {workspace.spaces.length ? workspace.spaces.slice(0, 5).map((space) => (
            <button key={space.id} className={`space-nav-item ${selectedSpace === space.id && section === "spaces" ? "space-nav-active" : ""}`} onClick={() => chooseSpace(space.id)}><span className="space-bullet" />{space.name}</button>
          )) : <p className="empty-side-note">Give a project, question, or loose thread its own space.</p>}
        </div>
        <div className="sidebar-bottom">
          <div className="local-status"><span className="local-status-dot" /><span>Only on this device</span></div>
          <button className="side-help" onClick={exportBackup}><Download size={16} /><span>Export a backup</span></button>
          <button className="side-help" onClick={() => toast("This is your browser’s copy", { description: "Notes and links stay here; nothing is sent to a cloud account." })}><CircleHelp size={16} /><span>How local storage works</span></button>
        </div>
      </aside>
      {mobileNavOpen && <button className="nav-scrim" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation" />}

      <main className="workspace" id="home">
        <header className="topbar">
          <div className="topbar-title-group">
            <button className="icon-button mobile-menu" onClick={() => setMobileNavOpen(true)} aria-label="Open navigation"><Menu size={19} /></button>
            <div><span className="breadcrumb-label">WORK LAYER / YOUR DESK</span><h1>{heading}</h1></div>
          </div>
          <div className="topbar-actions">
            <button className="search-trigger" onClick={() => setSearchOpen(true)} aria-label="Search notes and spaces"><Search size={17} /><span>Search</span><kbd><Command size={11} /> K</kbd></button>
            <button className="top-add-button" onClick={() => { setCaptureSpace(currentSpace?.id ?? ""); setDialog({ type: "link" }); }}><Plus size={17} /><span>Add link</span></button>
          </div>
        </header>

        <div className="workspace-content">
          {section === "home" ? (
            <>
              <section className="welcome-row">
                <div><div className="eyebrow home-eyebrow">A WORKING DESK, JUST YOURS</div><h2>{workspace.profile.displayName ? <>Good to see you,<br /><span>{workspace.profile.displayName}.</span></> : <>Leave a note<br /><span>for later.</span></>}</h2><p>Half-formed ideas, useful links, loose ends. Keep them here until you’re ready to pick them up.</p></div>
                <div className="welcome-mark" aria-hidden="true"><span className="paper-card paper-card-back" /><span className="paper-card paper-card-front"><span className="paper-card-label">A note to self</span><span className="paper-rule" /><span className="paper-rule paper-rule-short" /></span><span className="paper-clip" /></div>
              </section>

              <section className="capture-panel" aria-labelledby="capture-title">
                <div className="capture-heading"><span className="capture-symbol"><PenLine size={16} /></span><div><h3 id="capture-title">Make a note of it</h3><p>Short, messy, unfinished — it all belongs here.</p></div></div>
                <form onSubmit={saveCapture}>
                  <textarea value={capture} onChange={(event) => setCapture(event.target.value)} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") saveCapture(); }} placeholder="Start anywhere. A rough thought is enough; a web address saves as a link." rows={3} aria-label="Write a thought or paste a link" />
                  <div className="capture-tools">
                    <input className="file-input-hidden" id="capture-images" type="file" accept="image/*" multiple disabled={imagesProcessing} onChange={(event) => void attachImages(event, captureImages, setCaptureImages)} />
                    <label className="attachment-button" htmlFor="capture-images"><ImagePlus size={15} /> {imagesProcessing ? "Preparing…" : "Attach image"}</label>
                    <label className="capture-tag-field"><Tag size={14} /><input value={captureTags} onChange={(event) => setCaptureTags(event.target.value)} placeholder="Tags, comma separated" aria-label="Tags, comma separated" /></label>
                  </div>
                  {!!captureImages.length && <div className="image-preview-row">{captureImages.map((image) => <span className="image-preview" key={image.id}><img src={image.dataUrl} alt={image.name} /><button type="button" onClick={() => setCaptureImages((images) => images.filter((item) => item.id !== image.id))} aria-label={`Remove ${image.name}`}><X size={13} /></button></span>)}</div>}
                  <div className="capture-footer">
                    <label className="capture-space-select"><FolderOpen size={15} /><select aria-label="Choose a space" value={captureSpace} onChange={(event) => setCaptureSpace(event.target.value)}><option value="">Save to inbox</option>{workspace.spaces.map((space) => <option value={space.id} key={space.id}>{space.name}</option>)}</select><ChevronDown size={14} /></label>
                    <button className="capture-submit" type="submit" disabled={imagesProcessing}><span>Save to desk</span><Send size={15} /></button>
                  </div>
                </form>
                <div className="capture-shortcuts"><span>If you need a nudge</span>{["A question to untangle", "A thing to follow up", "An idea for later"].map((prompt) => <button key={prompt} onClick={() => setCapture(prompt)}>{prompt}<ArrowUpRight size={12} /></button>)}</div>
              </section>

              <section className="content-section">
                <div className="section-heading"><div><span className="eyebrow">KEEP RELATED THINGS CLOSE</span><h2>Spaces</h2></div><button className="subtle-action" onClick={() => { setSection("spaces"); setSelectedSpace(null); }}>All spaces <ArrowRight size={15} /></button></div>
                {workspace.spaces.length ? <div className="spaces-grid home-spaces">{workspace.spaces.slice(0, 3).map((space) => <SpaceCard key={space.id} space={space} count={workspace.items.filter((item) => item.spaceId === space.id).length} onClick={() => chooseSpace(space.id)} />)}<button className="create-space-card" onClick={() => setDialog({ type: "space" })}><span className="create-space-icon"><Plus size={18} /></span><strong>New space</strong><small>Give related things a home.</small></button></div> : <EmptyState icon={<Layers3 size={20} />} title="Nothing needs a shelf yet." body="Make a space for a project, a question, or anything you want to keep together." action="Make a space" onAction={() => setDialog({ type: "space" })} />}
              </section>

              <section className="content-section recent-section">
                <div className="section-heading"><div><span className="eyebrow">LAST LEFT HERE</span><h2>Back on your desk</h2></div><button className="subtle-action" onClick={() => goTo("inbox")}>Open inbox <ArrowRight size={15} /></button></div>
                {recentItems.length ? <div className="saved-list">{recentItems.map(renderItem)}</div> : <div className="quiet-empty"><span className="quiet-empty-icon"><Bookmark size={18} /></span><div><strong>A blank page is a good start.</strong><p>Drop a thought above, or save a link to pick up another day.</p></div></div>}
              </section>
            </>
          ) : section === "spaces" && !currentSpace ? (
            <section className="list-page"><div className="page-intro"><span className="eyebrow">MAKE ROOM FOR A PROJECT</span><h2>Some things belong together.</h2><p>Gather notes and links around a project or question. Everything stays on this device.</p></div><div className="section-heading list-heading"><div><span className="eyebrow">THE WHOLE SHELF</span><h2>{workspace.spaces.length ? `${workspace.spaces.length} ${workspace.spaces.length === 1 ? "space" : "spaces"}` : "No spaces so far"}</h2></div><button className="gold-button" onClick={() => setDialog({ type: "space" })}><Plus size={17} /> New space</button></div>{workspace.spaces.length ? <div className="spaces-grid">{workspace.spaces.map((space) => <SpaceCard key={space.id} space={space} count={workspace.items.filter((item) => item.spaceId === space.id).length} onClick={() => chooseSpace(space.id)} />)}</div> : <EmptyState icon={<Layers3 size={20} />} title="Start with one space" body="Give a project, question, or side-idea one place to gather." action="Make a space" onAction={() => setDialog({ type: "space" })} />}</section>
          ) : (
            <section className="list-page">
              <div className="page-intro"><span className="eyebrow">{section === "inbox" ? "WAITING TO BE SORTED" : section === "notes" ? "NOTES FROM YOURSELF" : "LINKS TO RETURN TO"}</span><h2>{section === "spaces" && currentSpace ? currentSpace.name : section === "inbox" ? "Everything in its own time." : section === "notes" ? "Thoughts you left yourself." : "Pages worth finding again."}</h2><p>{section === "spaces" && currentSpace ? "Notes and links you’ve gathered in this space." : section === "inbox" ? "New captures land here unless you give them a space." : section === "notes" ? "Draft thoughts, small reminders, and ideas that are still taking shape." : "The pages you meant to come back to, without another tab hunt."}</p></div>
              <div className="section-heading list-heading"><div><span className="eyebrow">{visibleItems.length ? "NEWEST ON TOP" : "A CLEAN PAGE"}</span><h2>{visibleItems.length ? `${visibleItems.length} ${visibleItems.length === 1 ? "item" : "items"}` : "Nothing here for now"}</h2></div><div className="list-actions">{currentSpace && <button className="danger-quiet" onClick={() => deleteSpace(currentSpace.id)}><Trash2 size={15} /><span>Delete space</span></button>}{section === "spaces" && <button className="subtle-action back-spaces" onClick={() => setSelectedSpace(null)}><ArrowDownLeft size={15} /> All spaces</button>}{section === "links" ? <button className="gold-button" onClick={() => { setCaptureSpace(""); setDialog({ type: "link" }); }}><Plus size={17} /> Add link</button> : <button className="gold-button" onClick={() => { setSection("home"); setCaptureSpace(currentSpace?.id ?? ""); window.setTimeout(() => document.querySelector<HTMLTextAreaElement>(".capture-panel textarea")?.focus(), 50); }}><Plus size={17} /> Capture</button>}</div></div>
              {!!availableTags.length && <div className="tag-filter-row" aria-label="Filter items by tag"><span><Tag size={14} /> Tags</span><button className={!selectedTag ? "tag-filter-active" : ""} onClick={() => setSelectedTag("")}>All</button>{availableTags.map((tag) => <button className={selectedTag.toLocaleLowerCase() === tag.toLocaleLowerCase() ? "tag-filter-active" : ""} key={tag} onClick={() => setSelectedTag(selectedTag.toLocaleLowerCase() === tag.toLocaleLowerCase() ? "" : tag)}>{tag}</button>)}</div>}
              {visibleItems.length ? <div className="saved-list">{[...visibleItems].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(renderItem)}</div> : selectedTag ? <EmptyState icon={<Tag size={20} />} title="Nothing with this tag here." body="Try another tag or show everything in this view." action="Show all" onAction={() => setSelectedTag("")} /> : <EmptyState icon={section === "links" ? <Link2 size={20} /> : <Inbox size={20} />} title={section === "spaces" ? "This space is ready." : section === "links" ? "No links saved yet." : "The inbox is still empty."} body={section === "spaces" ? "A note or link can start this space whenever you’re ready." : "Leave a note or a link here; it will wait until you need it."} action={section === "links" ? "Save a link" : "Capture a thought"} onAction={() => section === "links" ? setDialog({ type: "link" }) : (setSection("home"), window.setTimeout(() => document.querySelector<HTMLTextAreaElement>(".capture-panel textarea")?.focus(), 50))} />}
            </section>
          )}
          <footer className="workspace-footer"><span><span className="footer-check"><Check size={12} /></span> This browser holds your only copy</span><span>No account. No cloud sync.</span></footer>
        </div>
      </main>

      <nav className="mobile-tabbar" aria-label="Quick navigation">{NAV.filter((item) => item.id !== "links").map(({ id, label, icon: Icon }) => <button key={id} className={section === id ? "mobile-tab-active" : ""} onClick={() => goTo(id)}><Icon size={19} /><span>{label}</span></button>)}</nav>

      {searchOpen && <div className="modal-backdrop search-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSearchOpen(false); }}><div className="search-modal" role="dialog" aria-modal="true" aria-label="Search your notes and spaces"><div className="search-input-row"><Search size={19} /><input ref={searchRef} value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Find a note, link, or space…" /><kbd>ESC</kbd><button className="icon-button" onClick={() => setSearchOpen(false)} aria-label="Close search"><X size={17} /></button></div><div className="search-results"><span className="eyebrow">{searchQuery ? "MATCHING ITEMS" : "RECENT ITEMS"}</span>{searchResults.items.length ? searchResults.items.map((item) => <button className="search-result" key={item.id} onClick={() => { setSearchOpen(false); setDialog({ type: "item", itemId: item.id }); }}><span className="result-icon">{item.type === "link" ? <Globe2 size={16} /> : <FileText size={16} />}</span><span><strong>{item.title}</strong><small>{item.content}</small></span><ArrowUpRight size={15} /></button>) : <p className="search-no-results">No saved items match that search.</p>}{searchResults.spaces.length > 0 && <><span className="eyebrow search-spaces-label">SPACES</span>{searchResults.spaces.map((space) => <button className="search-result" key={space.id} onClick={() => { setSearchOpen(false); chooseSpace(space.id); }}><span className="result-icon"><Layers3 size={16} /></span><span><strong>{space.name}</strong><small>Space</small></span><ArrowRight size={15} /></button>)}</>}</div><div className="search-hint"><span>Search happens on this device</span><span><kbd>⌘ K</kbd> to open</span></div></div></div>}

      {dialog?.type === "profile" && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialog(null); }}><form className="form-modal" onSubmit={saveProfile} role="dialog" aria-modal="true" aria-labelledby="profile-modal-title"><div className="modal-top"><span className="modal-symbol"><UserRound size={18} /></span><button type="button" className="icon-button" onClick={() => setDialog(null)} aria-label="Close"><X size={18} /></button></div><span className="eyebrow">OPTIONAL, AND YOURS</span><h2 id="profile-modal-title">{workspace.profile.displayName ? "Edit your profile" : "Add a name (if you like)"}</h2><p>A name makes the desk feel like yours. Leave it blank if you prefer; it stays in this browser.</p><label className="field-label" htmlFor="profile-display-name">Display name</label><input id="profile-display-name" autoFocus autoComplete="nickname" value={profileNameDraft} onChange={(event) => setProfileNameDraft(event.target.value)} placeholder="Name (optional)" maxLength={48} /><div className="modal-actions"><button className="cancel-button" type="button" onClick={() => setDialog(null)}>Cancel</button><button className="gold-button" type="submit"><Check size={16} /> Save profile</button></div></form></div>}

      {dialog?.type === "space" && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialog(null); }}><form className="form-modal" onSubmit={createSpace} role="dialog" aria-modal="true" aria-labelledby="space-modal-title"><div className="modal-top"><span className="modal-symbol"><Layers3 size={18} /></span><button type="button" className="icon-button" onClick={() => setDialog(null)} aria-label="Close"><X size={18} /></button></div><span className="eyebrow">GIVE IT A PLACE</span><h2 id="space-modal-title">Create a space</h2><p>Projects, questions, or rabbit holes all make good spaces.</p><label className="field-label" htmlFor="space-name">Space name</label><input id="space-name" autoFocus value={spaceName} onChange={(event) => setSpaceName(event.target.value)} placeholder="e.g. Website refresh" maxLength={48} /><div className="modal-actions"><button className="cancel-button" type="button" onClick={() => setDialog(null)}>Cancel</button><button className="gold-button" type="submit" disabled={!spaceName.trim()}><Plus size={16} /> Create space</button></div></form></div>}

      {dialog?.type === "link" && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialog(null); }}><form className="form-modal" onSubmit={saveLink} role="dialog" aria-modal="true" aria-labelledby="link-modal-title"><div className="modal-top"><span className="modal-symbol"><Link2 size={18} /></span><button type="button" className="icon-button" onClick={() => setDialog(null)} aria-label="Close"><X size={18} /></button></div><span className="eyebrow">KEEP THE TAB, CLOSE THE TAB</span><h2 id="link-modal-title">Save a link</h2><p>Keep the page. Close the extra tab. It’ll be here when you want it.</p><label className="field-label" htmlFor="link-url">Web address</label><input id="link-url" autoFocus type="url" value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} placeholder="https://example.com/article" /><label className="field-label field-label-spaced" htmlFor="link-title">Name it <span>Optional</span></label><input id="link-title" value={linkTitle} onChange={(event) => setLinkTitle(event.target.value)} placeholder="A short, useful title" maxLength={72} /><label className="field-label field-label-spaced" htmlFor="link-space">Add to</label><select id="link-space" className="modal-select" value={captureSpace} onChange={(event) => setCaptureSpace(event.target.value)}><option value="">Inbox</option>{workspace.spaces.map((space) => <option value={space.id} key={space.id}>{space.name}</option>)}</select><div className="modal-actions"><button className="cancel-button" type="button" onClick={() => setDialog(null)}>Cancel</button><button className="gold-button" type="submit" disabled={!linkUrl.trim()}><Bookmark size={16} /> Save link</button></div></form></div>}

      {selectedItem && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialog(null); }}><div className="detail-modal" role="dialog" aria-modal="true" aria-labelledby="detail-title">
        <div className="modal-top"><span className={`modal-symbol ${selectedItem.type === "link" ? "link-symbol" : ""}`}>{selectedItem.type === "link" ? <Globe2 size={18} /> : <FileText size={18} />}</span><button type="button" className="icon-button" onClick={() => setDialog(null)} aria-label="Close"><X size={18} /></button></div>
        <span className="eyebrow">{selectedItem.type === "link" ? "SAVED LINK" : "SAVED NOTE"} · {formatDate(selectedItem.createdAt)}</span><h2 id="detail-title">{selectedItem.title}</h2>
        {selectedItem.type === "link" ? <><p className="detail-content">{selectedItem.url}</p><a className="gold-button detail-open-link" href={selectedItem.url} target="_blank" rel="noreferrer">Open link <ArrowUpRight size={15} /></a></> : <p className="detail-content note-detail-content">{selectedItem.content || "An image note."}</p>}
        {!!selectedItem.images?.length && <div className="detail-images">{selectedItem.images.map((image) => <figure key={image.id}><img src={image.dataUrl} alt={image.name} /><figcaption>{image.name}</figcaption></figure>)}</div>}
        {!!selectedItem.tags?.length && <div className="detail-tags"><Tag size={14} />{selectedItem.tags.map((tag) => <span className="item-tag" key={tag}>{tag}</span>)}</div>}
        <div className="detail-bottom"><span className="detail-folder"><FolderOpen size={14} />{workspace.spaces.find((space) => space.id === selectedItem.spaceId)?.name ?? "Inbox"}</span><div className="detail-actions"><button className="detail-tool-button" onClick={() => void copyItem(selectedItem)}><Copy size={14} /> Copy</button><button className="detail-tool-button" onClick={() => openEditor(selectedItem)}><Pencil size={14} /> Edit</button><button className="danger-quiet" onClick={() => deleteItem(selectedItem.id)}><Trash2 size={14} /><span>Delete</span></button></div></div>
      </div></div>}

      {editingItem && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialog({ type: "item", itemId: editingItem.id }); }}><form className="form-modal item-edit-modal" onSubmit={saveEditedItem} role="dialog" aria-modal="true" aria-labelledby="edit-item-title">
        <div className="modal-top"><span className="modal-symbol"><Pencil size={18} /></span><button type="button" className="icon-button" onClick={() => setDialog({ type: "item", itemId: editingItem.id })} aria-label="Close"><X size={18} /></button></div>
        <span className="eyebrow">MAKE IT YOURS</span><h2 id="edit-item-title">Edit {editingItem.type === "link" ? "link" : "note"}</h2>
        <label className="field-label" htmlFor="edit-item-name">Title</label><input id="edit-item-name" autoFocus value={editTitle} onChange={(event) => setEditTitle(event.target.value)} maxLength={72} />
        {editingItem.type === "link" ? <><label className="field-label field-label-spaced" htmlFor="edit-item-content">Web address</label><input id="edit-item-content" type="url" value={editContent} onChange={(event) => setEditContent(event.target.value)} /></> : <><label className="field-label field-label-spaced" htmlFor="edit-item-content">Note</label><textarea className="edit-textarea" id="edit-item-content" value={editContent} onChange={(event) => setEditContent(event.target.value)} rows={6} /></>}
        <label className="field-label field-label-spaced" htmlFor="edit-item-space">Move to folder</label><select id="edit-item-space" className="modal-select" value={editSpace} onChange={(event) => setEditSpace(event.target.value)}><option value="">Inbox</option>{workspace.spaces.map((space) => <option key={space.id} value={space.id}>{space.name}</option>)}</select>
        <label className="field-label field-label-spaced" htmlFor="edit-item-tags">Tags <span>Separate with commas</span></label><input id="edit-item-tags" value={editTags} onChange={(event) => setEditTags(event.target.value)} placeholder="e.g. idea, follow-up" />
        <div className="edit-attachments"><input className="file-input-hidden" id="edit-item-images" type="file" accept="image/*" multiple disabled={imagesProcessing} onChange={(event) => void attachImages(event, editImages, setEditImages, editingItem.id)} /><label className="attachment-button" htmlFor="edit-item-images"><ImagePlus size={15} /> {imagesProcessing ? "Preparing…" : "Add images"}</label><span>{editImages.length}/{MAX_IMAGES_PER_ITEM}</span></div>
        {!!editImages.length && <div className="image-preview-row">{editImages.map((image) => <span className="image-preview" key={image.id}><img src={image.dataUrl} alt={image.name} /><button type="button" onClick={() => setEditImages((images) => images.filter((item) => item.id !== image.id))} aria-label={`Remove ${image.name}`}><X size={13} /></button></span>)}</div>}
        <div className="modal-actions"><button className="cancel-button" type="button" onClick={() => setDialog({ type: "item", itemId: editingItem.id })}>Cancel</button><button className="gold-button" type="submit" disabled={imagesProcessing}><Check size={16} /> Save changes</button></div>
      </form></div>}

      {installVisible && <div className="install-banner"><span className="install-icon"><DownloadIcon /></span><span><strong>Keep Work Layer close</strong><small>A small desk for your phone or computer.</small></span><button onClick={installApp}>Install</button><button className="install-dismiss" onClick={() => setInstallVisible(false)} aria-label="Dismiss install message"><X size={16} /></button></div>}
    </div>
  );
}

function SpaceCard({ space, count, onClick }: { space: Space; count: number; onClick: () => void }) {
  return <button className="space-card" onClick={onClick}><span className="space-card-icon"><Layers3 size={19} /></span><span className="space-card-main"><strong>{space.name}</strong><small>{count} {count === 1 ? "item" : "items"}</small></span><ArrowUpRight size={16} className="space-card-arrow" /></button>;
}

function EmptyState({ icon, title, body, action, onAction }: { icon: ReactNode; title: string; body: string; action: string; onAction: () => void }) {
  return <div className="empty-state"><span className="empty-state-icon">{icon}</span><strong>{title}</strong><p>{body}</p><button className="gold-button" onClick={onAction}><Plus size={16} />{action}</button></div>;
}

function DownloadIcon() {
  return <Download size={17} />;
}

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
