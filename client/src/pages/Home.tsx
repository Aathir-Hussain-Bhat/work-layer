import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
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
  Download,
  FileText,
  FolderOpen,
  Globe2,
  Inbox,
  Layers3,
  Link2,
  Menu,
  PenLine,
  Plus,
  Search,
  Send,
  Trash2,
  UserRound,
  X,
} from "lucide-react";

type Section = "home" | "inbox" | "spaces" | "notes" | "links";
type Space = { id: string; name: string; createdAt: string };
type UserProfile = { displayName: string };
type SavedItem = {
  id: string;
  title: string;
  content: string;
  type: "note" | "link";
  url?: string;
  spaceId?: string;
  createdAt: string;
};
type WorkspaceData = { profile: UserProfile; spaces: Space[]; items: SavedItem[] };
type Dialog = { type: "profile" } | { type: "space" } | { type: "link" } | { type: "item"; itemId: string } | null;

const STORAGE_KEY = "layer-workspace-local-v2";
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
      items: Array.isArray(parsed.items) ? parsed.items : [],
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

export default function Home() {
  const [workspace, setWorkspace] = useState<WorkspaceData>(loadWorkspace);
  const [section, setSection] = useState<Section>("home");
  const [capture, setCapture] = useState("");
  const [captureSpace, setCaptureSpace] = useState("");
  const [selectedSpace, setSelectedSpace] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [spaceName, setSpaceName] = useState("");
  const [profileNameDraft, setProfileNameDraft] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkTitle, setLinkTitle] = useState("");
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
  const heading = section === "spaces" && currentSpace ? currentSpace.name : NAV.find((item) => item.id === section)?.label ?? "Home";
  const visibleItems = useMemo(() => {
    if (section === "inbox") return workspace.items.filter((item) => !item.spaceId);
    if (section === "notes") return workspace.items.filter((item) => item.type === "note");
    if (section === "links") return workspace.items.filter((item) => item.type === "link");
    if (section === "spaces" && currentSpace) return workspace.items.filter((item) => item.spaceId === currentSpace.id);
    return workspace.items;
  }, [section, workspace.items, currentSpace]);
  const recentItems = [...workspace.items].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 4);
  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return { items: workspace.items.slice(0, 5), spaces: workspace.spaces.slice(0, 3) };
    return {
      items: workspace.items.filter((item) => `${item.title} ${item.content} ${item.url ?? ""}`.toLowerCase().includes(query)).slice(0, 8),
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
    setWorkspace((current) => ({ ...current, items: [next, ...current.items] }));
    toast.success(item.type === "link" ? "Link saved" : "Thought saved", { description: item.title });
  };

  const saveCapture = (event?: FormEvent) => {
    event?.preventDefault();
    const value = capture.trim();
    if (!value) {
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
    addItem(parsedUrl
      ? { title: getLinkTitle(parsedUrl.toString()), content: parsedUrl.toString(), url: parsedUrl.toString(), type: "link", spaceId: captureSpace || undefined }
      : { title: value.split("\n")[0].slice(0, 72) || "Untitled note", content: value, type: "note", spaceId: captureSpace || undefined });
    setCapture("");
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
    addItem({ title: linkTitle.trim() || getLinkTitle(parsed.toString()), content: parsed.toString(), url: parsed.toString(), type: "link", spaceId: captureSpace || undefined });
    setLinkUrl("");
    setLinkTitle("");
    setDialog(null);
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
        <span className={`saved-item-icon ${item.type === "link" ? "link-icon" : "note-icon"}`}><Icon size={17} /></span>
        <span className="saved-item-copy">
          <strong>{item.title}</strong>
          <span>{item.type === "link" ? item.url : item.content}</span>
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
                  <div className="capture-footer">
                    <label className="capture-space-select"><FolderOpen size={15} /><select aria-label="Choose a space" value={captureSpace} onChange={(event) => setCaptureSpace(event.target.value)}><option value="">Save to inbox</option>{workspace.spaces.map((space) => <option value={space.id} key={space.id}>{space.name}</option>)}</select><ChevronDown size={14} /></label>
                    <button className="capture-submit" type="submit"><span>Save to desk</span><Send size={15} /></button>
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
              {visibleItems.length ? <div className="saved-list">{[...visibleItems].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(renderItem)}</div> : <EmptyState icon={section === "links" ? <Link2 size={20} /> : <Inbox size={20} />} title={section === "spaces" ? "This space is ready." : section === "links" ? "No links saved yet." : "The inbox is still empty."} body={section === "spaces" ? "A note or link can start this space whenever you’re ready." : "Leave a note or a link here; it will wait until you need it."} action={section === "links" ? "Save a link" : "Capture a thought"} onAction={() => section === "links" ? setDialog({ type: "link" }) : (setSection("home"), window.setTimeout(() => document.querySelector<HTMLTextAreaElement>(".capture-panel textarea")?.focus(), 50))} />}
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

      {selectedItem && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialog(null); }}><div className="detail-modal" role="dialog" aria-modal="true" aria-labelledby="detail-title"><div className="modal-top"><span className={`modal-symbol ${selectedItem.type === "link" ? "link-symbol" : ""}`}>{selectedItem.type === "link" ? <Globe2 size={18} /> : <FileText size={18} />}</span><button type="button" className="icon-button" onClick={() => setDialog(null)} aria-label="Close"><X size={18} /></button></div><span className="eyebrow">{selectedItem.type === "link" ? "SAVED LINK" : "SAVED NOTE"} · {formatDate(selectedItem.createdAt)}</span><h2 id="detail-title">{selectedItem.title}</h2>{selectedItem.type === "link" ? <><p className="detail-content">{selectedItem.url}</p><a className="gold-button detail-open-link" href={selectedItem.url} target="_blank" rel="noreferrer">Open link <ArrowUpRight size={15} /></a></> : <p className="detail-content note-detail-content">{selectedItem.content}</p>}<div className="detail-bottom"><span>{workspace.spaces.find((space) => space.id === selectedItem.spaceId)?.name ?? "Inbox"}</span><button className="danger-quiet" onClick={() => deleteItem(selectedItem.id)}><Trash2 size={15} /><span>Delete</span></button></div></div></div>}

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
