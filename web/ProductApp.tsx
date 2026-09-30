import { t, useLanguage, LanguagePicker } from "./locale";
import React, { useEffect, useState } from "react";
import {
  ArrowUpRight,
  Check,
  CheckCircle2,
  Clock,
  GitBranch,
  GitPullRequest,
  Github,
  History,
  LayoutDashboard,
  Loader2,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  ListChecks,
  Terminal,
  TriangleAlert,
  Wrench,
  X,
  BookOpen,
  Download,
  LogOut,
  ChevronDown,
} from "lucide-react";
import "./design.css";
import Landing from "./Landing";
import { ThemeMenu } from "./theme";
import {
  Picker,
  EvidenceTabs,
  PublicMenu,
  Status,
  StageRail,
  ReadingFrame,
  LoadingWorkspace,
  titleCase,
} from "./ui";
let csrf = "";
async function api(path: string, body?: any) {
  const response = await fetch("/api" + path, {
    cache: "no-store",
    credentials: "same-origin",
    method: body === undefined ? "GET" : "POST",
    headers:
      body === undefined
        ? {}
        : { "Content-Type": "application/json", "X-CSRF-Token": csrf },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || t("Request failed"));
  return value;
}
const finished = [
  "verified",
  "submitted",
  "failed",
  "unsupported",
  "cancelled",
];
const params = new URLSearchParams(location.search);
const requestedPage = location.pathname.split("/")[1] || "landing";
const page = [
  "landing",
  "docs",
  "faq",
  "support",
  "privacy",
  "terms",
  "extension",
  "dashboard",
  "onboarding",
  "workbench",
  "history",
  "repositories",
  "account",
].includes(requestedPage)
  ? requestedPage
  : "not-found";
function Goblin() {
  return (
    <img
      className="product-goblin"
      src="/goblin.svg"
      alt=""
      width="48"
      height="48"
    />
  );
}
function Brand() {
  return (
    <a className="brand" href="/" aria-label={t("PatchGoblin home")}>
      <Goblin />
      <span>PatchGoblin</span>
    </a>
  );
}
function Heading({
  title,
  children,
  action,
}: {
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        <p>{children}</p>
      </div>
      {action}
    </div>
  );
}
function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="product-empty">
      <Goblin />
      <h2>{title}</h2>
      <p>{children}</p>
      {action}
    </section>
  );
}
function Notice({
  children,
  error = false,
}: {
  children: React.ReactNode;
  error?: boolean;
}) {
  const Icon = error ? TriangleAlert : CheckCircle2;
  return (
    <div
      className={error ? "error" : "product-notice"}
      role={error ? "alert" : "status"}
    >
      <Icon size={18} aria-hidden="true" />
      <div>{typeof children === "string" ? t(children) : children}</div>
    </div>
  );
}
function External({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
      <ArrowUpRight aria-hidden="true" size={14} />
    </a>
  );
}
export default function ProductApp() {
  const language = useLanguage();
  const [boot, setBoot] = useState<any>(null),
    [config, setConfig] = useState<any>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  async function refresh() {
    const [b, c] = await Promise.all([api("/bootstrap"), api("/public")]);
    csrf = b.csrf || "";
    setBoot(b);
    setConfig(c);
    setError("");
  }
  useEffect(() => {
    refresh()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    const titles: Record<string, string> = {
      landing: t("Verified CI repair"),
      dashboard: t("Repository overview"),
      workbench: t("CI workbench"),
      history: t("Run history"),
      repositories: t("Repository settings"),
      account: t("Account"),
      onboarding: t("Connect repositories"),
      docs: "Documentation",
      faq: "FAQ",
      extension: t("Browser extension"),
      privacy: "Privacy",
      terms: t("Terms of use"),
      support: "Support",
    };
    document.title = `${t(titles[page] || "Page not found")} | PatchGoblin`;
  }, [language]);
  useEffect(() => {
    if (boot?.connected && page === "landing" && params.get("job"))
      location.replace(
        "/workbench?job=" + encodeURIComponent(params.get("job")!),
      );
  }, [boot?.connected]);
  async function logout() {
    try {
      await api("/auth/logout", {});
      location.assign("/");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const publicPage = [
    "landing",
    "docs",
    "faq",
    "support",
    "privacy",
    "terms",
    "extension",
    "not-found",
  ].includes(page);
  const install = config?.installation_url;
  const login =
    "/api/auth/login?return_to=" +
    encodeURIComponent(
      params.get("job")
        ? "/workbench?job=" + params.get("job")
        : publicPage
          ? "/dashboard"
          : location.pathname + location.search,
    );
  const publicHeader = (
    <header className="public-header">
      <Brand />
      <nav aria-label={t("Public navigation")}>
        <a
          className="public-link"
          href="/docs"
          aria-current={page === "docs" ? "page" : undefined}
        >
          {t("Documentation")}
        </a>
        <a
          className="public-link"
          href="/extension"
          aria-current={page === "extension" ? "page" : undefined}
        >
          {t("Extension")}
        </a>
        <a
          className="public-link"
          href="/faq"
          aria-current={page === "faq" ? "page" : undefined}
        >
          {t("FAQ")}
        </a>
        <LanguagePicker />
        <ThemeMenu />
        {boot?.connected ? (
          <a className="primary" href="/dashboard">
            {t("Open workspace")}
          </a>
        ) : (
          <a className="primary sign-in" href={login}>
            <Github aria-hidden="true" size={16} />
            {t("Sign in with GitHub")}
          </a>
        )}
        <PublicMenu
          action={
            boot?.connected ? t("Open workspace") : t("Sign in with GitHub")
          }
          href={boot?.connected ? "/dashboard" : login}
        />
      </nav>
    </header>
  );
  const footer = (
    <footer className="public-footer">
      <div>
        <Brand />
        <p>{t("Small patches \u00B7 Strong evidence")}</p>
      </div>
      <nav aria-label={t("Footer")}>
        <a href="/privacy">{t("Privacy")}</a>
        <a href="/terms">{t("Terms")}</a>
        <a href="/support">{t("Support")}</a>
        <External href="https://github.com/wauul/PatchGoblin">
          {t("Source")}
        </External>
      </nav>
    </footer>
  );
  if (publicPage)
    return (
      <div className="public-shell">
        <a className="skip-link" href="#content">
          {t("Skip to content")}
        </a>
        {publicHeader}
        {(error || params.get("auth_error")) && (
          <Notice error>{error || params.get("auth_error")}</Notice>
        )}
        {params.has("deleted") && (
          <Notice>
            {t(
              "Your PatchGoblin account and stored evidence were deleted. GitHub pull requests and installations remain on GitHub.",
            )}
          </Notice>
        )}
        {page === "landing" ? (
          <main id="content">
            <Landing
              login={boot?.connected ? "/dashboard" : login}
              install={install}
              connected={!!boot?.connected}
            />
          </main>
        ) : page === "extension" ? (
          <Extension />
        ) : page === "not-found" ? (
          <main id="content">
            <Empty
              title={t("Page not found")}
              action={
                <a className="primary" href="/">
                  {t("Open home page")}
                </a>
              }
            >
              {t(
                "This page does not exist. Use the navigation to return to PatchGoblin.",
              )}
            </Empty>
          </main>
        ) : (
          <Information page={page} config={config} />
        )}{" "}
        {footer}
      </div>
    );
  if (loading)
    return (
      <div className="public-shell">
        {publicHeader}
        <LoadingWorkspace />
      </div>
    );
  if (!boot?.connected)
    return (
      <div className="public-shell">
        {publicHeader}
        <Empty
          title={
            error ? t("Workspace unavailable") : t("Sign in to your workspace")
          }
          action={
            error ? (
              <button
                className="primary"
                onClick={() => {
                  setLoading(true);
                  refresh()
                    .catch((e) => setError(e.message))
                    .finally(() => setLoading(false));
                }}
              >
                {t("Retry connection")}
              </button>
            ) : (
              <a className="primary" href={login}>
                <Github aria-hidden="true" size={18} />
                {t("Sign in with GitHub")}
              </a>
            )
          }
        >
          {error
            ? t(
                "We could not connect to your workspace. Check your connection and try again.",
              )
            : t(
                "Sign in to see installed repositories and run verified CI jobs. Repository installation is a separate step.",
              )}
        </Empty>
        {footer}
      </div>
    );
  const links = [
    ["dashboard", LayoutDashboard, t("Dashboard")],
    ["workbench", Wrench, t("Workbench")],
    ["history", History, t("Run history")],
    ["repositories", Settings, t("Repositories")],
    ["account", ShieldCheck, t("Account")],
  ] as const;
  return (
    <div className="app-shell">
      <a className="skip-link" href="#content">
        {t("Skip to content")}
      </a>
      <aside className="sidebar">
        <Brand />
        <nav aria-label={t("Workspace navigation")}>
          {links.map(([id, Icon, label]) => (
            <a
              key={id}
              aria-label={label}
              aria-current={page === id ? "page" : undefined}
              className={"nav-link " + (page === id ? "selected" : "")}
              href={"/" + id}
            >
              <Icon size={18} aria-hidden="true" />
              <span className="desktop-nav-label">{label}</span>
              <span className="mobile-nav-label">
                {id === "repositories"
                  ? t("Repos")
                  : id === "history"
                    ? t("History")
                    : label}
              </span>
            </a>
          ))}
        </nav>
        <div className="connection">
          <Github aria-hidden="true" size={18} />
          <div>
            <strong>{boot.login}</strong>
            <span>
              {boot.repositories.length} {t("selected repositories")}
            </span>
          </div>
        </div>
        <div className="sidebar-bottom">
          <div className="goblin-note">
            <ShieldCheck aria-hidden="true" size={18} />
            <p>
              {t("Verify first.")}
              <br />
              {t("Review before merging.")}
            </p>
          </div>
          <a className="source-link" href="/docs">
            <BookOpen aria-hidden="true" size={16} />
            {t("Documentation")}
          </a>
          <button className="source-link" onClick={logout}>
            <LogOut aria-hidden="true" size={16} />
            {t("Sign out")}
          </button>
          <div className="version">
            {t("PatchGoblin v2")}
            <span>Python + Node</span>
          </div>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <div className="mobile-brand">
            <Brand />
          </div>
          <span className="breadcrumb">
            {t("Workspace")}
            <span aria-hidden="true">/</span> <strong>{titleCase(page)}</strong>
          </span>
          <div className="topbar-actions">
            <LanguagePicker />
            <ThemeMenu />
            <a href="/account" className="account-badge">
              <Github aria-hidden="true" size={16} />
              {boot.login}
            </a>
            <button
              className="icon-button mobile-logout"
              onClick={logout}
              aria-label={t("Sign out")}
            >
              <LogOut aria-hidden="true" size={18} />
            </button>
          </div>
        </header>
        <div className="content" id="content">
          {error && <Notice error>{error}</Notice>}
          {page === "dashboard" ? (
            <Dashboard boot={boot} install={install} refresh={refresh} />
          ) : page === "onboarding" ? (
            <Onboarding boot={boot} install={install} refresh={refresh} />
          ) : page === "workbench" ? (
            <Workbench boot={boot} />
          ) : page === "history" ? (
            <RunHistory />
          ) : page === "repositories" ? (
            <RepositorySettings
              boot={boot}
              install={install}
              refresh={refresh}
            />
          ) : page === "account" ? (
            <Account boot={boot} />
          ) : (
            <Empty
              title={t("Page not found")}
              action={
                <a href="/dashboard" className="primary">
                  {t("Open dashboard")}
                </a>
              }
            >
              {t("This workspace page does not exist.")}
            </Empty>
          )}
        </div>
      </main>
    </div>
  );
}
function Dashboard({ boot, install, refresh }: any) {
  const [health, setHealth] = useState<Record<string, any>>({}),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    Promise.all(
      boot.repositories.slice(0, 12).map(async (r: any) => {
        try {
          const result = await api(
            "/repositories/health?repo=" + encodeURIComponent(r.full_name),
          );
          if (live) setHealth((h) => ({ ...h, [r.full_name]: result }));
        } catch (e) {
          if (live)
            setHealth((h) => ({
              ...h,
              [r.full_name]: { error: (e as Error).message },
            }));
        }
      }),
    );
    return () => {
      live = false;
    };
  }, [boot.repositories.map((r: any) => r.id).join(",")]);
  async function sync() {
    if (!boot.repository_authorized) {
      location.assign("/api/github/connect");
      return;
    }
    setBusy(true);
    try {
      await api("/github/sync", {});
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Heading
        title={t("Repository overview")}
        action={
          <a href="/workbench" className="primary">
            <Wrench aria-hidden="true" size={16} />
            {t("Start a job")}
          </a>
        }
      >
        {t("Current GitHub Actions results and recorded job usage.")}
      </Heading>
      {error && <Notice error>{error}</Notice>}
      {!boot.account.onboarding_at && (
        <Notice>
          {t("Finish")}{" "}
          <a href="/onboarding">{t("connecting your repositories")}</a>{" "}
          {t("before starting a job.")}
        </Notice>
      )}
      <dl className="dashboard-stats">
        <div>
          <dt>{t("Selected repositories")}</dt>
          <dd>{boot.repositories.length}</dd>
        </div>
        <div>
          <dt>{t("Jobs in the last 24 hours")}</dt>
          <dd>{boot.usage.daily}</dd>
        </div>
        <div>
          <dt>{t("Recorded model tokens")}</dt>
          <dd>
            {Number(boot.usage.model_tokens).toLocaleString(
              document.documentElement.lang,
            )}
          </dd>
        </div>
      </dl>
      <div className="section-heading">
        <h2>{t("Connected repositories")}</h2>
        <div>
          <button
            className="secondary"
            onClick={sync}
            disabled={busy}
            aria-busy={busy}
          >
            {busy ? (
              <Loader2 aria-hidden="true" className="spin" size={15} />
            ) : (
              <Github aria-hidden="true" size={15} />
            )}{" "}
            {busy ? t("Syncing access\u2026") : t("Sync access")}
          </button>
          {install && (
            <a className="secondary" href={install}>
              {t("Install on GitHub")}
              <ArrowUpRight aria-hidden="true" size={15} />
            </a>
          )}
        </div>
      </div>
      {boot.repositories.length ? (
        <section
          className="repository-list"
          aria-label={t("Connected repositories")}
        >
          {boot.repositories.map((r: any) => {
            const h = health[r.full_name],
              latest = h?.runs?.[0];
            return (
              <article className="repository-row" key={r.id}>
                <div className="repository-identity">
                  <GitBranch aria-hidden="true" size={19} />
                  <div>
                    <h3>{r.full_name}</h3>
                    <p>
                      {r.private ? t("Private") : t("Public")} ·{" "}
                      {r.default_branch} ·{" "}
                      {r.can_push ? t("Write access") : t("Read access")}
                    </p>
                  </div>
                </div>
                <div className="repo-health">
                  {h?.error ? (
                    <div>
                      <strong>{t("CI unavailable")}</strong>
                      <p className="red">{h.error}</p>
                    </div>
                  ) : !h ? (
                    <span className="muted" role="status">
                      <Loader2 aria-hidden="true" className="spin" size={15} />
                      {t("Checking CI\u2026")}
                    </span>
                  ) : latest ? (
                    <a href={latest.url} target="_blank" rel="noreferrer">
                      <Status value={latest.conclusion || latest.status} />
                      <span>
                        {latest.name}
                        <ArrowUpRight aria-hidden="true" size={14} />
                      </span>
                    </a>
                  ) : (
                    <span className="muted">
                      <Plus aria-hidden="true" size={16} />
                      {t("No workflow runs")}
                    </span>
                  )}
                </div>
                <div className="repo-controls">
                  <span>
                    {!r.enabled
                      ? t("Jobs disabled")
                      : r.paused
                        ? t("All jobs paused")
                        : r.auto_repair || r.auto_builder || r.auto_maintenance
                          ? t("Automation enabled")
                          : t("Manual jobs")}
                  </span>
                  <a
                    href={
                      "/repositories?repo=" + encodeURIComponent(r.full_name)
                    }
                  >
                    {t("Settings")}
                  </a>
                </div>
                <a
                  className="secondary"
                  href={"/workbench?repo=" + encodeURIComponent(r.full_name)}
                >
                  {t("Workbench")}
                </a>
              </article>
            );
          })}
        </section>
      ) : (
        <Empty
          title={t("No repositories selected")}
          action={
            install && (
              <a href={install} className="primary">
                {t("Install on GitHub")}
                <ArrowUpRight aria-hidden="true" size={16} />
              </a>
            )
          }
        >
          {t(
            "Install the GitHub App and choose which repositories PatchGoblin can access. Signing in grants identity access only.",
          )}
        </Empty>
      )}
    </>
  );
}
function Onboarding({ boot, install, refresh }: any) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function sync() {
    if (!boot.repository_authorized) {
      location.assign("/api/github/connect");
      return;
    }
    setBusy(true);
    try {
      await api("/github/sync", {});
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function finish() {
    try {
      await api("/account/onboarding", {});
      location.assign("/dashboard");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <Heading title={t("Connect repositories")}>
        {t(
          "Your GitHub identity is connected. Repository permissions come next. Sign-in requests public identity only.",
        )}
      </Heading>
      {error && <Notice error>{error}</Notice>}
      <div className="onboarding-grid">
        <article className="settings-panel">
          <span className="step-number">{t("Step 1")}</span>
          <h2>{t("Install on selected repositories")}</h2>
          <p>
            {t(
              "Choose your personal account or an organization you administer, then explicitly authorize the GitHub App to confirm your access to its selected repositories. Organization approval and SAML requirements remain under GitHub\u2019s control.",
            )}
          </p>
          {install && (
            <a className="primary" href={install}>
              {t("Install on GitHub")}
              <ArrowUpRight aria-hidden="true" size={16} />
            </a>
          )}
          <button className="secondary" onClick={sync} disabled={busy}>
            {boot.repository_authorized
              ? t("I installed it \u00B7 refresh access")
              : t("Authorize selected repository access")}{" "}
            {busy && <Loader2 aria-hidden="true" size={15} className="spin" />}
          </button>
          {boot.repository_authorized && (
            <a className="secondary" href="/api/github/connect">
              {t("Reconnect GitHub App authorization")}
            </a>
          )}
        </article>
        <article className="settings-panel">
          <span className="step-number">{t("Step 2")}</span>
          <h2>{t("Start with manual control")}</h2>
          <p>
            {t(
              "Automatic repair, missing-CI creation and maintenance are off by default. Repository admins can enable each mode and set daily limits in settings.",
            )}
          </p>
          <ul>
            {boot.repositories.map((r: any) => (
              <li key={r.id}>
                <Check aria-hidden="true" size={15} />
                {r.full_name}
              </li>
            ))}
          </ul>
          <button
            className="primary"
            disabled={!boot.repositories.length}
            onClick={finish}
          >
            {t("Open my dashboard")}
          </button>
        </article>
      </div>
      <Notice>
        {t(
          "App permissions: Actions and metadata read; contents, workflows, pull requests and checks write. It cannot read repository secrets, change branch protection, or merge automatically.",
        )}
      </Notice>
    </>
  );
}
function Workbench({ boot }: any) {
  const [repo, setRepo] = useState(
      params.get("repo") || boot.repositories[0]?.full_name || "",
    ),
    [mode, setMode] = useState(params.get("mode") || "repair"),
    [runs, setRuns] = useState<any[]>([]),
    [run, setRun] = useState(params.get("run") || ""),
    [ref, setRef] = useState("main"),
    [job, setJob] = useState<any>(null),
    [tab, setTab] = useState("diagnosis"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    const selected = boot.repositories.find((r: any) => r.full_name === repo);
    setRef(selected?.default_branch || "main");
    setRuns([]);
    setRun(params.get("run") || "");
    if (repo)
      api("/runs?repo=" + encodeURIComponent(repo))
        .then((d) => {
          if (live) setRuns(d.runs);
        })
        .catch((e) => {
          if (live) setError(e.message);
        });
    return () => {
      live = false;
    };
  }, [repo]);
  useEffect(() => {
    if (params.get("job"))
      api("/jobs/" + params.get("job"))
        .then(setJob)
        .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (!job) return;
    let disposed = false;
    async function tick() {
      try {
        let next = await api("/jobs/" + job.id);
        if (next.pr_sha && next.status === "submitted")
          next = await api("/jobs/" + job.id + "/sync", {});
        if (!disposed) setJob(next);
      } catch (e) {
        if (!disposed) setError((e as Error).message);
      }
    }
    const timer = setInterval(tick, 8000);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [job?.id]);
  async function start() {
    setBusy(true);
    setError("");
    try {
      const next = await api("/jobs", {
        repo,
        mode,
        run_id: mode === "repair" ? Number(run) : null,
        ref,
        key: crypto.randomUUID(),
      });
      setJob(next);
      history.replaceState(null, "", "/workbench?job=" + next.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function action(name: string) {
    try {
      setJob(await api("/jobs/" + job.id + "/" + name, {}));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <Heading title={t("CI workbench")}>
        {t(
          "Choose a task, verify its evidence, then review the proposed change.",
        )}
      </Heading>
      {error && <Notice error>{error}</Notice>}
      <details className="launch-details" open={!job}>
        <summary>
          <span>{t("Start a CI job")}</span>
          <span>{repo || t("Choose a repository")}</span>
        </summary>
        <section className="launch-panel">
          <div className="panel-heading">
            <h2>{t("Configure a job")}</h2>
            <span className="muted">Python + Node</span>
          </div>
          <div className="mode-options product-modes">
            {[
              [
                Wrench,
                "repair",
                t("Repair a failure"),
                t("Reproduce a failed install"),
              ],
              [Plus, "builder", t("Create CI"), t("Build a missing pipeline")],
              [
                ListChecks,
                "maintenance",
                t("Maintain CI"),
                t("Find uncovered checks"),
              ],
            ].map(([Icon, id, title, description]: any) => (
              <button
                key={id}
                className={"mode " + (mode === id ? "active" : "")}
                onClick={() => setMode(id)}
                aria-pressed={mode === id}
              >
                <span className="mode-icon">
                  <Icon aria-hidden="true" size={19} />
                </span>
                <span>
                  <strong>{title}</strong>
                  <small>{description}</small>
                </span>
              </button>
            ))}
          </div>
          <div className="form-grid">
            <div className="field">
              <span className="field-label">{t("Repository")}</span>
              <Picker
                label={t("Repository")}
                value={repo}
                onChange={setRepo}
                placeholder={t("Select a repository")}
                options={boot.repositories.map((r: any) => ({
                  value: r.full_name,
                  label:
                    r.full_name + (!r.can_push ? " · " + t("Read only") : ""),
                }))}
              />
            </div>
            {mode === "repair" ? (
              <div className="field">
                <span className="field-label">{t("Failed workflow run")}</span>
                <Picker
                  label={t("Failed workflow run")}
                  value={run}
                  onChange={setRun}
                  placeholder={
                    runs.length
                      ? t("Choose a failed run")
                      : t("No failed runs found")
                  }
                  options={runs.map((r) => ({
                    value: String(r.id),
                    label: r.name + " · " + r.branch + " · #" + r.id,
                  }))}
                />
              </div>
            ) : (
              <label>
                {t("Base branch")}
                <input value={ref} onChange={(e) => setRef(e.target.value)} />
              </label>
            )}
            <button
              className="primary launch"
              onClick={start}
              disabled={
                busy ||
                !repo ||
                !boot.repositories.find((r: any) => r.full_name === repo)
                  ?.can_push ||
                !boot.repositories.find((r: any) => r.full_name === repo)
                  ?.enabled ||
                boot.repositories.find((r: any) => r.full_name === repo)
                  ?.paused ||
                (mode === "repair" && !run) ||
                (job && !finished.includes(job.status))
              }
            >
              {busy ? (
                <Loader2 aria-hidden="true" className="spin" size={16} />
              ) : (
                <ListChecks aria-hidden="true" size={16} />
              )}
              {mode === "builder"
                ? t("Create CI")
                : mode === "maintenance"
                  ? t("Check coverage")
                  : t("Start repair")}
            </button>
          </div>
          {repo &&
            (!boot.repositories.find((r: any) => r.full_name === repo)
              ?.can_push ||
              !boot.repositories.find((r: any) => r.full_name === repo)
                ?.enabled ||
              boot.repositories.find((r: any) => r.full_name === repo)
                ?.paused) && (
              <p className="field-help">
                {!boot.repositories.find((r: any) => r.full_name === repo)
                  ?.can_push
                  ? t("Write access is required to start a job.")
                  : t(
                      "Jobs are paused or disabled for this repository. An administrator can update repository settings.",
                    )}
              </p>
            )}
          <div className="launch-foot">
            <span>
              <ShieldCheck aria-hidden="true" size={14} />
              {t(
                "Disposable sandbox \u00B7 Required checks preserved \u00B7 No auto-merge",
              )}
            </span>
            <span>{t("12,000 tokens / 10 min max")}</span>
          </div>
        </section>
      </details>
      {job ? (
        <>
          <div className="results-heading">
            <h2>
              {t("Job #")}
              {job.id}
              <span>{job.repo}</span>
            </h2>
            <Status value={job.status} />
          </div>
          <StageRail job={job} />
          <div className="investigation-grid">
            <section className="evidence-panel">
              <div className="job-meta">
                <span>
                  <GitBranch aria-hidden="true" size={15} />
                  {job.base_ref || job.ref}
                </span>
                <code>{job.sha?.slice(0, 12) || t("Awaiting worker")}</code>
                <span>{titleCase(job.mode)}</span>
              </div>
              <EvidenceTabs
                value={tab}
                onChange={setTab}
                counts={{
                  diagnosis: job.evidence?.length,
                  verification: job.verification?.length,
                  coverage: job.coverage?.requirements?.units?.length,
                }}
              >
                {tab === "diagnosis" ? (
                  <>
                    <h3>{t("Diagnosis")}</h3>
                    <p className="diagnosis-summary">
                      {job.diagnosis ||
                        t("Waiting for the next available worker.")}
                    </p>
                    <div className="evidence-list">
                      {job.evidence?.map((v: string, i: number) => (
                        <div key={i}>
                          <span>{i + 1}</span>
                          <p>{v}</p>
                        </div>
                      ))}
                    </div>
                    {job.limitations?.length > 0 && (
                      <div className="limitations">
                        <ShieldCheck aria-hidden="true" size={18} />
                        <div>
                          <strong>{t("Verification boundaries")}</strong>
                          {job.limitations.map((v: string, i: number) => (
                            <p key={i}>{v}</p>
                          ))}
                        </div>
                      </div>
                    )}
                    {job.pr_error && (
                      <Notice error>
                        {job.pr_error}
                        <button
                          className="secondary"
                          onClick={() => action("submit")}
                        >
                          {t("Retry submission")}
                        </button>
                      </Notice>
                    )}
                  </>
                ) : tab === "diff" ? (
                  job.diff ? (
                    <pre className="diff">
                      {job.diff.split("\n").map((line: string, i: number) => (
                        <div
                          key={i}
                          className={
                            line.startsWith("+")
                              ? "added"
                              : line.startsWith("-")
                                ? "removed"
                                : ""
                          }
                        >
                          <span className="line-no" aria-hidden="true">
                            {i + 1}
                          </span>
                          {line || " "}
                        </div>
                      ))}
                    </pre>
                  ) : (
                    <Empty title={t("No patch yet")}>
                      {t(
                        "Only evidence-backed, supported changes become patches.",
                      )}
                    </Empty>
                  )
                ) : tab === "verification" ? (
                  <>
                    <h3>{t("Verification receipts")}</h3>
                    <h4>{t("Original reproduction")}</h4>
                    {job.reproduction?.length ? (
                      job.reproduction.map((v: any, i: number) => (
                        <CheckRow value={v} key={i} />
                      ))
                    ) : (
                      <p className="muted">
                        {t(
                          "No failing command reproduction recorded for this mode.",
                        )}
                      </p>
                    )}
                    <h4>{t("Patched sandbox checks")}</h4>
                    {job.verification?.length ? (
                      job.verification.map((v: any, i: number) => (
                        <CheckRow value={v} key={i} />
                      ))
                    ) : (
                      <p className="muted">{t("No verified checks yet.")}</p>
                    )}
                    <h4>{t("Remote GitHub Actions")}</h4>
                    {job.remote_ci?.length ? (
                      job.remote_ci.map((r: any) => (
                        <a
                          className="remote-run"
                          key={r.id}
                          href={r.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {r.conclusion === "success" ? (
                            <CheckCircle2 aria-hidden="true" size={16} />
                          ) : r.conclusion === "failure" ? (
                            <TriangleAlert aria-hidden="true" size={16} />
                          ) : (
                            <Clock aria-hidden="true" size={16} />
                          )}
                          <span>{r.name}</span>
                          <Status value={r.conclusion || r.status} />
                          <ArrowUpRight aria-hidden="true" size={14} />
                        </a>
                      ))
                    ) : (
                      <p className="muted">
                        {t("Remote CI has not been confirmed.")}
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <h3>{t("What the pipeline covers")}</h3>
                    {job.coverage ? (
                      <>
                        <p className="muted">
                          {t(
                            "Detected requirements and the pipeline coverage before this proposal.",
                          )}
                        </p>
                        {job.coverage.requirements?.units?.map((u: any) => (
                          <article
                            className="coverage-unit"
                            key={u.path + u.language}
                          >
                            <strong>
                              {u.path} · {u.language}
                            </strong>
                            <p>
                              {u.manager} · {u.runtime}
                            </p>
                            {u.checks.map((c: string) => (
                              <div key={c}>
                                <code>{c}</code>
                                <span>
                                  {job.coverage.covered?.some(
                                    (x: any) =>
                                      x.path === u.path && x.command === c,
                                  )
                                    ? t("Covered")
                                    : t("Coverage gap")}
                                </span>
                              </div>
                            ))}
                          </article>
                        ))}
                      </>
                    ) : (
                      <p className="muted">
                        {t(
                          "Coverage is recorded for pipeline creation and maintenance jobs.",
                        )}
                      </p>
                    )}
                  </>
                )}
              </EvidenceTabs>
              {job.pr_url && (
                <a
                  href={job.pr_url}
                  className="pr-banner"
                  target="_blank"
                  rel="noreferrer"
                >
                  <GitPullRequest aria-hidden="true" size={20} />
                  <div>
                    <strong>{t("Verified proposal, ready for review")}</strong>
                    <span>
                      {t("Pull request #")}
                      {job.pr_number} {t("\u00B7 You decide when to merge.")}
                    </span>
                  </div>
                  <ArrowUpRight aria-hidden="true" size={18} />
                </a>
              )}
            </section>
            <aside className="activity-panel">
              <div className="activity-heading">
                <h3>{t("Investigation log")}</h3>
                {!finished.includes(job.status) && (
                  <Loader2 aria-hidden="true" size={16} className="spin" />
                )}
              </div>
              <div className="events" aria-live="polite">
                {(job.events?.length
                  ? job.events
                  : [
                      {
                        stage: "queued",
                        message: t("Waiting for the durable queue."),
                      },
                    ]
                ).map((e: any, i: number) => (
                  <div key={i} className="event">
                    <span className="event-point" />
                    <div>
                      <strong>{titleCase(e.stage)}</strong>
                      <p>{e.message}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="metrics">
                {[
                  [
                    t("Duration"),
                    job.metrics?.duration_seconds == null
                      ? t("Unavailable")
                      : job.metrics.duration_seconds + "s",
                  ],
                  [
                    t("Model tokens"),
                    job.metrics?.model_tokens?.toLocaleString(
                      document.documentElement.lang,
                    ) ?? t("Unavailable"),
                  ],
                  [
                    t("Tool calls"),
                    job.metrics?.tool_calls ?? t("Unavailable"),
                  ],
                  [
                    t("Token cost estimate"),
                    job.metrics?.estimated_cost_usd == null
                      ? t("Unavailable")
                      : "$" + job.metrics.estimated_cost_usd,
                  ],
                ].map(([label, value]) => (
                  <div key={label}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
              {!finished.includes(job.status) && (
                <button className="cancel" onClick={() => action("cancel")}>
                  <X aria-hidden="true" size={15} />
                  {t("Cancel investigation")}
                </button>
              )}
              <small>
                {t(
                  "Token estimate uses published model rates. Actual charges and infrastructure costs are separate.",
                )}
              </small>
            </aside>
          </div>
        </>
      ) : (
        <Empty title={t("Ready for an investigation")}>
          {t(
            "Select an installed repository and a mode. Every live run persists across refreshes.",
          )}
        </Empty>
      )}
    </>
  );
}
function CheckRow({ value: v }: any) {
  return (
    <details className="check-row">
      <summary>
        <ChevronDown className="disclosure-icon" size={16} aria-hidden="true" />
        <span className={v.exit_code === 0 ? "green" : "red"}>
          {v.exit_code === 0 ? (
            <CheckCircle2 aria-hidden="true" size={17} />
          ) : (
            <TriangleAlert aria-hidden="true" size={17} />
          )}
        </span>
        <code>
          {v.working_directory && v.working_directory !== "."
            ? v.working_directory + " / "
            : ""}
          {v.command}
        </code>
        <span>
          {v.exit_code === 0 ? t("Passed") : t("Exit ") + v.exit_code}
        </span>
        <small>
          {v.duration_seconds}
          {t("s")}
        </small>
      </summary>
      <pre>{v.logs || t("Command completed without diagnostic output.")}</pre>
      <small>
        {t("Network:")}
        {v.network}
      </small>
    </details>
  );
}
function RunHistory() {
  const [jobs, setJobs] = useState<any[] | null>(null),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState("all"),
    [error, setError] = useState("");
  useEffect(() => {
    api("/jobs")
      .then((d) => setJobs(d.jobs))
      .catch((e) => setError(e.message));
  }, []);
  const filtered = jobs?.filter(
    (j) =>
      (status === "all" || j.status === status) &&
      (j.repo + " " + j.mode + " " + j.id + " " + j.diagnosis)
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <>
      <Heading title={t("Run history")}>
        {t(
          "Find a repository, diagnosis or job number. Review its saved evidence.",
        )}
      </Heading>
      {error && <Notice error>{error}</Notice>}
      <div className="history-filters">
        <label>
          <Search aria-hidden="true" size={17} />
          <input
            aria-label={t("Search run history")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("Repository, diagnosis, or job number")}
          />
        </label>
        <Picker
          label={t("Filter job status")}
          value={status}
          onChange={setStatus}
          options={[
            "all",
            "submitted",
            "verified",
            "failed",
            "unsupported",
            "cancelled",
            "queued",
          ].map((s) => ({
            value: s,
            label: s === "all" ? t("All statuses") : titleCase(s),
          }))}
        />
      </div>
      <section className="history-panel">
        {jobs === null ? (
          <Empty title={t("Loading run history")}>
            <Loader2 aria-hidden="true" className="spin" />
          </Empty>
        ) : filtered?.length ? (
          filtered.map((j) => (
            <a
              href={"/workbench?job=" + j.id}
              key={j.id}
              className="history-row"
            >
              <span className="history-identity">
                <strong>{j.repo}</strong>
                <small>
                  {titleCase(j.mode)}
                  {t("\u00B7 Job #")}
                  {j.id} ·{" "}
                  {new Date(j.created_at).toLocaleString(
                    document.documentElement.lang,
                  )}
                </small>
              </span>
              <Status value={j.status} />
            </a>
          ))
        ) : (
          <Empty
            title={jobs.length ? t("No matching runs") : t("No jobs yet")}
            action={
              <a className="primary" href="/workbench">
                {t("Open workbench")}
              </a>
            }
          >
            {jobs.length
              ? t("Try a different search or status.")
              : t("Live jobs and their evidence will appear here.")}
          </Empty>
        )}
      </section>
    </>
  );
}
function RepositorySettings({ boot, install, refresh }: any) {
  const [repo, setRepo] = useState(
      params.get("repo") || boot.repositories[0]?.full_name || "",
    ),
    [values, setValues] = useState<any>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const selected = boot.repositories.find((r: any) => r.full_name === repo);
  useEffect(() => {
    setValues(
      selected
        ? {
            repo,
            ...Object.fromEntries(
              [
                "enabled",
                "paused",
                "auto_repair",
                "auto_builder",
                "auto_maintenance",
                "daily_limit",
                "retention_days",
              ].map((k) => [k, selected[k]]),
            ),
          }
        : null,
    );
  }, [repo, boot]);
  useEffect(() => setMessage(""), [repo]);
  async function save() {
    setBusy(true);
    try {
      await api("/repositories/settings", values);
      await refresh();
      setMessage(
        "Repository settings saved. Disabling or pausing also cancels active jobs.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Heading
        title={t("Repository settings")}
        action={
          install && (
            <a href={install} className="secondary">
              {t("Manage GitHub installation")}
              <ArrowUpRight aria-hidden="true" size={15} />
            </a>
          )
        }
      >
        {t("Automation is off until a repository administrator enables it.")}
      </Heading>
      {error && <Notice error>{error}</Notice>}
      {message && <Notice>{message}</Notice>}
      {!selected ? (
        <Empty
          title={t("No repositories connected")}
          action={
            install && (
              <a className="primary" href={install}>
                {t("Install on GitHub")}
              </a>
            )
          }
        >
          {t("Select repositories during the GitHub App installation.")}
        </Empty>
      ) : (
        <>
          <div className="field repository-select">
            <span className="field-label">{t("Repository")}</span>
            <Picker
              label={t("Repository")}
              value={repo}
              onChange={setRepo}
              options={boot.repositories.map((r: any) => ({
                value: r.full_name,
                label: r.full_name,
              }))}
            />
          </div>
          {!selected.can_admin && (
            <Notice>
              {t(
                "Your GitHub access lets you view this repository. Automation settings require repository administration permission.",
              )}
            </Notice>
          )}
          {values && (
            <section className="settings-panel">
              <h2>{t("Job access and automation")}</h2>
              <p>
                {selected.private ? t("Private") : t("Public")} ·{" "}
                {selected.account_type}
                {t("\u00B7 Installation #")}
                {selected.installation_id}
              </p>
              {[
                [
                  "enabled",
                  t("Enable live jobs"),
                  t("Allow authorized users to start jobs on this repository."),
                ],
                [
                  "paused",
                  t("Pause all jobs"),
                  t("Suspend all new work and cancel active jobs."),
                ],
                [
                  "auto_repair",
                  t("Automatic verified repairs"),
                  t(
                    "On supported workflow failures, diagnose, reproduce, verify, and open a repair PR.",
                  ),
                ],
                [
                  "auto_builder",
                  t("Create missing CI"),
                  t(
                    "On a default-branch push, create CI only when no workflow exists.",
                  ),
                ],
                [
                  "auto_maintenance",
                  t("Continuous CI maintenance"),
                  t(
                    "Compare manifests and existing coverage after pushes and pull request updates. New jobs are debounced.",
                  ),
                ],
              ].map(([key, label, description]) => (
                <label key={key} className="toggle-row">
                  <span>
                    <strong>{label}</strong>
                    <small>{description}</small>
                  </span>
                  <input
                    type="checkbox"
                    role="switch"
                    checked={values[key]}
                    disabled={!selected.can_admin}
                    onChange={(e) =>
                      setValues({ ...values, [key]: e.target.checked })
                    }
                  />
                </label>
              ))}
              <div className="settings-fields">
                <div className="field">
                  <span className="field-label">
                    {t("Repository jobs per 24 hours")}
                  </span>
                  <Picker
                    label={t("Repository jobs per 24 hours")}
                    disabled={!selected.can_admin}
                    value={String(values.daily_limit)}
                    onChange={(v) =>
                      setValues({ ...values, daily_limit: Number(v) })
                    }
                    options={[1, 2, 3, 4, 5].map((v) => ({
                      value: String(v),
                      label: `${v} ${t(v === 1 ? "job" : "jobs")}`,
                    }))}
                  />
                </div>
                <div className="field">
                  <span className="field-label">{t("Run retention")}</span>
                  <Picker
                    label={t("Run retention")}
                    disabled={!selected.can_admin}
                    value={String(values.retention_days)}
                    onChange={(v) =>
                      setValues({ ...values, retention_days: Number(v) })
                    }
                    options={[7, 30, 90].map((v) => ({
                      value: String(v),
                      label: `${v} ${t("days")}`,
                    }))}
                  />
                </div>
              </div>
              <Notice>
                {t(
                  "One concurrent worker across the service. Eight jobs per account per hour and 30 jobs across the service per day. Limits also apply to webhook automation.",
                )}
              </Notice>
              <button
                className="primary"
                disabled={busy || !selected.can_admin}
                onClick={save}
              >
                {busy ? (
                  <Loader2 aria-hidden="true" className="spin" size={16} />
                ) : (
                  <Check aria-hidden="true" size={16} />
                )}
                {t("Save settings")}
              </button>
            </section>
          )}
        </>
      )}
    </>
  );
}
function Account({ boot }: any) {
  const [confirm, setConfirm] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function remove() {
    setBusy(true);
    try {
      await api("/account/delete", { confirm });
      location.assign("/?deleted=1");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Heading title={t("Account and data")}>
        {t("GitHub is the only sign-in provider. No password to manage here.")}
      </Heading>
      {error && <Notice error>{error}</Notice>}
      <section className="settings-panel">
        <h2>
          <Github aria-hidden="true" size={20} />
          {boot.login}
        </h2>
        <p>
          {t(
            "Sessions last up to seven days. Sign out to revoke the current session immediately. Separately authorized GitHub App credentials remain encrypted on the server; identity-only sign-in tokens are not stored.",
          )}
        </p>
        <a href="/api/account/export" className="secondary">
          <Download aria-hidden="true" size={16} />
          {t("Export my data")}
        </a>
        <a
          href="https://github.com/settings/installations"
          target="_blank"
          rel="noreferrer"
          className="secondary"
        >
          {t("Manage App installations")}
          <ArrowUpRight aria-hidden="true" size={15} />
        </a>
        <p>
          {t(
            "Export includes profile metadata, repository settings and your jobs with evidence. It never includes authentication tokens.",
          )}
        </p>
      </section>
      <section className="settings-panel danger-panel">
        <h2>{t("Delete your PatchGoblin account")}</h2>
        <p>
          {t(
            "This deletes your stored GitHub credentials, sessions and job evidence; cancels running jobs; and disables automations you enabled. Credential-free sandboxes are destroyed by the worker or their idle timeout. GitHub pull requests, commits and App installations remain on GitHub.",
          )}
        </p>
        <p id="deletion-help">
          {t(
            "Deleting this account does not uninstall the GitHub App or erase GitHub pull requests. Uninstall the App on GitHub to remove its repository access. A future sign-in creates a new account.",
          )}
        </p>
        <label>
          {t("Type")} <strong>{boot.login}</strong> {t("to confirm")}
          <input
            aria-label={t("Confirm account deletion")}
            aria-describedby="deletion-help"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="off"
          />
        </label>
        <button
          className="danger-button"
          disabled={confirm !== boot.login || busy}
          onClick={remove}
        >
          {busy ? t("Deleting…") : t("Delete my account and data")}
        </button>
      </section>
    </>
  );
}
function Extension() {
  return (
    <ReadingFrame page="extension">
      <h1>{t("Browser extension")}</h1>
      <p>
        {t(
          "PatchGoblin\u2019s Chrome and Edge extension recognizes repository and Actions run pages. It opens the authenticated workbench with the right repository and run selected.",
        )}
      </p>
      <a className="primary" href="/patchgoblin-extension.zip">
        <Download aria-hidden="true" size={17} />
        {t("Download extension package")}
      </a>
      <h2>{t("Install unpacked")}</h2>
      <ol>
        <li>{t("Download and extract the package.")}</li>
        <li>
          {t("Open")} <code>{t("chrome://extensions")}</code> {t("or")}{" "}
          <code>{t("edge://extensions")}</code>.
        </li>
        <li>
          {t(
            "Enable Developer mode, choose \u201CLoad unpacked\u201D, and select the extracted folder containing",
          )}{" "}
          <code>{t("manifest.json")}</code>.
        </li>
        <li>
          {t(
            "Visit a GitHub repository or failed Actions run, then open the PatchGoblin toolbar popup.",
          )}
        </li>
        <li>
          {t(
            "Sign in on PatchGoblin and install the GitHub App for the selected repository.",
          )}
        </li>
      </ol>
      <h2>{t("Authentication and permissions")}</h2>
      <p>
        {t(
          "The extension uses no GitHub tokens and stores no credentials. Actions open a normal HTTPS PatchGoblin tab, where your HTTP-only session and the same server permission checks apply. The popup reads basic installation and job status using your existing browser session. The workbench verifies authorization again before starting any job.",
        )}
      </p>
      <p>
        {t("The")} <code>{t("activeTab")}</code>{" "}
        {t(
          "permission reads the URL only when you invoke the popup. One host permission, for PatchGoblin alone, reads basic status using your existing browser session. There are no GitHub host permissions, content scripts, background polling or extension-storage permissions. GitHub navigation is recognized each time you open it.",
        )}
      </p>
      <p>
        {t(
          "This is an unpacked package, not a store listing. Reproducible build and publication instructions are in the source README.",
        )}
      </p>
    </ReadingFrame>
  );
}
function Information({ page, config }: any) {
  const support =
    config?.support_url || "https://github.com/wauul/PatchGoblin/issues";
  const operator = config?.operator
    ? t(config.operator)
    : t("Operated by GitHub account wauul.");
  return (
    <ReadingFrame page={page}>
      {page === "docs" ? (
        <>
          <h1>{t("Documentation")}</h1>
          <h2>{t("Connect your workspace")}</h2>
          <p>
            {t(
              "Sign in with GitHub, then install the App on selected personal or organization repositories. Organization administrators may need to approve access. Sign-in alone does not grant repository access.",
            )}
          </p>
          <h2>{t("Run the agent")}</h2>
          <p>
            {t(
              "Repair mode reproduces a failed dependency installation at its original commit. Builder reads manifests and declared checks to add missing CI. Maintenance compares an explicit coverage model with current requirements and adds uncovered commands in a separate workflow.",
            )}
          </p>
          <p>
            {t(
              "Supported environments: Python 3.11\u20133.13 with pip or uv, and Node 22/24 with npm, pnpm or Yarn. Reproducible Node installation requires a committed lockfile. Node repair currently targets a single root package; monorepo creation and maintenance detect individual packages.",
            )}
          </p>
          <h2>{t("Read the evidence")}</h2>
          <p>
            {t(
              "Each job keeps diagnosis, patch diff, command results, model usage and limitations. Sandbox checks and remote Actions results are shown separately. No tests are disabled, and no PR is opened when verification fails.",
            )}
          </p>
          <h2>{t("Continuous maintenance")}</h2>
          <p>
            {t(
              "Manifest commands, runtimes, package managers, test frameworks, configuration files and path filters inform coverage. New service dependencies are detected and reported for manual verification. Arbitrary application changes alone do not justify a CI update. Existing hand-written jobs and permissions stay intact.",
            )}
          </p>
          <h2>{t("Safety and budgets")}</h2>
          <p>
            {t(
              "Repository code runs in a disposable Railway VM inside a restricted Docker container without credentials. Installation network access is limited to package registries; checks have no network access. One worker, six investigation steps, two patch attempts, 12,000 model tokens and ten minutes bound each job.",
            )}
          </p>
          <h2>{t("Unsupported cases")}</h2>
          <p>
            {t(
              "Application bugs and assertion failures, secrets and permission failures, arbitrary custom workflow actions, unsupported runtimes, complex repair matrices and services need manual review. Fork pull requests are not automatically executed. Unsupported results remain visible without a fabricated successful repair.",
            )}
          </p>
          <h2>{t("Real examples")}</h2>
          <p>
            <External href="https://github.com/wauul/patchgoblin-lab/pull/3">
              {t("Verified Python CI creation")}
            </External>{" "}
            {t("and")}{" "}
            <External href="https://github.com/wauul/patchgoblin-lab/pull/4">
              {t("Verified dependency repair")}
            </External>{" "}
            {t(
              "came from real Groq runs in the seeded public lab. Historical Qwen evaluation results are identified separately in the README.",
            )}
          </p>
        </>
      ) : page === "faq" ? (
        <>
          <h1>{t("Frequently asked questions")}</h1>
          {[
            [
              t("Does signing in connect all my repositories?"),
              t(
                "No. GitHub login identifies you. App installation separately selects repositories and permissions.",
              ),
            ],
            [
              t("Will it merge changes for me?"),
              t(
                "No. PatchGoblin opens reviewable pull requests. A human decides whether to merge.",
              ),
            ],
            [
              t("Does it support organizations and private repositories?"),
              t(
                "Installation-scoped access supports both, subject to your actual GitHub permissions and organization policies. Private content is accessed only for selected repositories.",
              ),
            ],
            [
              t("What happens when automation is paused?"),
              t(
                "New jobs are blocked and active jobs are cancelled. Already-open GitHub pull requests remain reviewable.",
              ),
            ],
            [
              t("Why did a job stop without a PR?"),
              t(
                "The failure may not reproduce, may be unsupported, or may exhaust a budget. Verification failures never count as repairs. The job records the actual reason.",
              ),
            ],
            [
              t("Is every changed file a reason to change CI?"),
              t(
                "No. Maintenance compares detected project requirements with explicit workflow coverage. With no evidence-backed gap, it performs no model call or edit.",
              ),
            ],
            [
              t("What does the cost estimate mean?"),
              t(
                "Measured model tokens are multiplied by published Groq model list rates. Actual account charges and hosting costs are unavailable and are not included.",
              ),
            ],
            [
              t("Is the extension in a store?"),
              t(
                "The downloadable unpacked package is not described as store-listed. Store publication depends on account access and any registration fee.",
              ),
            ],
          ].map(([q, a]) => (
            <details key={q}>
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </>
      ) : page === "privacy" ? (
        <>
          <h1>{t("Privacy")}</h1>
          <p>
            {t("Effective September 30, 2026.")} {operator}
          </p>
          <h2>{t("Data accessed and stored")}</h2>
          <p>
            {t(
              "GitHub sign-in supplies your account ID, login and avatar URL. Selected App installations supply repository names, access permissions, default branches and automation metadata. Live jobs retrieve repository archives at an immutable commit, manifests, workflow configuration, relevant source, run/job metadata and bounded CI logs.",
            )}
          </p>
          <p>
            {t(
              "Neon stores profile metadata, encrypted GitHub App user-authorization credentials, hashed sessions, repository settings, job state, diffs, filtered logs, verification results and usage metrics. Source archives exist temporarily in the worker and disposable sandbox; they are not retained as a permanent source mirror.",
            )}
          </p>
          <h2>{t("Chrome extension")}</h2>
          <p>
            {t(
              "When you open the extension, it reads the active tab URL to recognize a GitHub repository and optional Actions run ID. For recognized GitHub pages, it sends only the repository name and optional run ID to patchgoblin.vercel.app over HTTPS to check access, installation and recent job status. It does not read page contents or collect browsing history in the background. The browser sends your existing PatchGoblin session cookie with status requests; extension JavaScript cannot read that HTTP-only cookie. GitHub credentials are never stored in the extension. Only language and appearance preferences are stored locally. Job buttons open the web workbench, where you review the context and explicitly start work.",
            )}
          </p>
          <p>
            {t(
              "PatchGoblin uses extension data only to provide its GitHub CI workbench features and necessary operations. It does not sell extension user data, use it for advertising or credit decisions, or transfer it for unrelated purposes. Human access is limited to explicit user consent, security investigations, legal requirements or aggregated anonymous operational data. Use of extension data follows the Chrome Web Store User Data Policy, including its Limited Use requirements.",
            )}
          </p>
          <p>
            {t("Extension publisher: Wauul. Contact: ")}
            <a href="mailto:waelfeza@gmail.com">waelfeza@gmail.com</a>
          </p>
          <h2>{t("Model processing")}</h2>
          <p>
            {t(
              "Groq receives bounded, redacted workflow and manifest snippets, filtered failure logs, investigation results and the proposed patch context. Relevant source snippets requested by the agent may also be sent. Token redaction is best-effort: do not commit secrets or sensitive personal data to repositories or CI logs. Do not enable automation on content you are not authorized to send to these providers.",
            )}
          </p>
          <h2>{t("Credentials and cookies")}</h2>
          <p>
            {t(
              "Sign-in uses a separate identity-only OAuth App. Its token is used once to confirm your public GitHub identity and is not stored. The separately authorized GitHub App access and refresh tokens are encrypted with AES-256-GCM in Neon. The encryption key and GitHub App private key are held in server secret stores. Installation tokens are short lived, restricted to one repository per job and kept in trusted server processes. They never enter sandbox or extension storage. Session cookies are Secure, HTTP-only and SameSite=Lax. OAuth state uses one-time, browser-bound records and PKCE.",
            )}
          </p>
          <h2>{t("Retention and deletion")}</h2>
          <p>
            {t(
              "Repository job evidence defaults to 30 days; admins can choose 7, 30 or 90 days. Expired sessions and OAuth states are removed during scheduled retention, and webhook metadata is retained up to seven days after completion or failure. Job archives are discarded when execution ends. Sandbox teardown runs at completion or cancellation, with an idle timeout as a fallback.",
            )}
          </p>
          <p>
            {t(
              "Account deletion immediately removes credentials and sessions, erases your job request/evidence data and cancels active work. Cleanup retains only an opaque job identifier and sandbox/lease metadata until teardown completes. Automations you controlled are disabled. Uninstalling or removing repository access stops automation, cancels work and removes access memberships. GitHub commits and PRs remain on GitHub; provider backups and provider operational logs follow those providers\u2019 policies.",
            )}
          </p>
          <h2>{t("Third parties")}</h2>
          <p>
            {t(
              "GitHub provides identity, installations and repository APIs; Vercel hosts the web/API; Neon stores application data; Groq performs model inference; Railway hosts the worker and isolated execution. Package registries receive installation requests. These services apply their own terms and retention policies.",
            )}
          </p>
          <h2>{t("Your controls and contact")}</h2>
          <p>
            {t(
              "Use repository settings to pause or disable automation, GitHub to change installation selection, and Account to export or delete your stored data. No advertising trackers are installed.",
            )}
          </p>
          <p>
            {config?.legal_contact
              ? t("Operator contact: ") + config.legal_contact
              : t(
                  "A dedicated legal contact address has not been configured. Contact the operator through the project support link; do not post private data publicly.",
                )}{" "}
            <External href={support}>{t("Support")}</External>
          </p>
        </>
      ) : page === "terms" ? (
        <>
          <h1>{t("Terms of use")}</h1>
          <p>
            {t("Effective September 30, 2026.")} {operator}{" "}
            {t(
              "No separate legal entity, certification or jurisdiction-specific guarantee is claimed.",
            )}
          </p>
          <h2>{t("Use and authorization")}</h2>
          <p>
            {t(
              "Use PatchGoblin only with repositories you are authorized to access and process. You are responsible for installing the App, choosing repositories, approving provider processing and enabling automation. Your GitHub permissions and organization policies continue to apply.",
            )}
          </p>
          <h2>{t("Automation and review")}</h2>
          <p>
            {t(
              "PatchGoblin diagnoses supported failures and proposes bounded changes. Generated code and model conclusions can be wrong. Review the patch, verification evidence, dependency licenses and remote CI before merging. Sandbox verification does not guarantee that production deployment is safe. No automatic merge, repository-secret change or branch-protection change is permitted by this product.",
            )}
          </p>
          <h2>{t("Service limits")}</h2>
          <p>
            {t(
              "This is an independently operated application with usage caps and supported-scope boundaries. Provider quota, outages, token expiry, unsupported repository structure and sandbox limits can prevent completion. Availability, correctness and uninterrupted service are not guaranteed. Do not use it as the sole control for safety-critical systems.",
            )}
          </p>
          <h2>{t("Prohibited use")}</h2>
          <p>
            {t(
              "Do not upload secrets, evade budgets, impersonate users, bypass repository permissions, attack providers or submit repository code for unlawful purposes. Installation network access and executable tools are deliberately restricted.",
            )}
          </p>
          <h2>{t("Data and leaving")}</h2>
          <p>
            {t(
              "The privacy page describes accessed data and providers. You retain ownership of your repository content. Export or delete your account in settings; uninstall the App on GitHub to remove repository permissions. Existing PRs and commits remain under GitHub and repository controls.",
            )}
          </p>
          <h2>{t("Operator details")}</h2>
          <p>
            {config?.legal_contact
              ? t("Contact: ") + config.legal_contact
              : t(
                  "A dedicated legal contact and any additional jurisdiction-specific publication details are not configured. No details have been invented.",
                )}{" "}
            <External href={support}>{t("Contact project support")}</External>
          </p>
        </>
      ) : (
        <>
          <h1>{t("Support")}</h1>
          <h2>{t("Support")}</h2>
          <p>
            {t(
              "Report reproducible product issues through the public source repository. Include the page, job number and sanitized error. Never include tokens, private source, private logs or personal information in a public issue.",
            )}
          </p>
          <a
            className="primary"
            href={support}
            target="_blank"
            rel="noreferrer"
          >
            {t("Open project support")}
            <ArrowUpRight aria-hidden="true" size={16} />
          </a>
          <h2>{t("Troubleshooting")}</h2>
          <p>
            {t(
              "Missing repository: refresh installation access, check selected repositories on GitHub and verify organization approval. Unauthorized action: check your current write/admin permissions. Expired login: sign in again. Queued job: reopen its details to wake durable work. Usage limit: inspect repository limits and retry after the rolling window expires.",
            )}
          </p>
          <h2>{t("Publication details")}</h2>
          <p>
            {t(
              "A dedicated private support or legal-contact address is configurable but has not been supplied. Do not publish private vulnerability details in a public issue; contact the operator through an existing trusted private channel.",
            )}
          </p>
        </>
      )}
    </ReadingFrame>
  );
}
