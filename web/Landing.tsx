import { t } from "./locale";
import {
  ArrowUpRight,
  CheckCircle2,
  Github,
  GitPullRequest,
  Plus,
  ShieldCheck,
  TriangleAlert,
  Wrench,
  ListChecks,
} from "lucide-react";
const getExamples = () => [
  {
    Icon: Wrench,
    name: t("Repair"),
    description: t(
      "Reproduce a supported dependency failure. Verify a minimal fix against the original checks.",
    ),
    result: t("npm lockfile repaired"),
    href: "https://github.com/wauul/patchgoblin-lab/pull/6",
    label: t("Repair PR #6"),
  },
  {
    Icon: Plus,
    name: t("Create CI"),
    description: t(
      "Read manifests and declared commands. Build the pipeline a Python or Node project is missing.",
    ),
    result: t("Node pipeline created"),
    href: "https://github.com/wauul/patchgoblin-product-lab/pull/1",
    label: t("Builder PR #1"),
  },
  {
    Icon: ListChecks,
    name: t("Maintain CI"),
    description: t(
      "Find uncovered packages or checks. Add verified coverage while preserving hand-written workflows.",
    ),
    result: t("TypeScript checks added"),
    href: "https://github.com/wauul/patchgoblin-lab/pull/5",
    label: t("Maintenance PR #5"),
  },
];
export default function Landing({
  login,
  install,
  connected = false,
}: {
  login: string;
  install?: string;
  connected?: boolean;
}) {
  const action = connected ? t("Open workspace") : t("Sign in with GitHub");
  return (
    <>
      <section className="landing-intro">
        <div className="hero-heading">
          <h1>
            {t("Red build")}
            <br />
            <span>{t("Reviewed fix")}</span>
          </h1>
          <div className="hero-intro">
            <p>
              {t(
                "Repair dependency failures, create missing CI, and maintain pipeline coverage. Verified in isolation. Submitted for your review.",
              )}
            </p>
            <a className="primary" href={login}>
              <Github size={18} aria-hidden="true" />
              {action}
            </a>
            <a className="text-link" href="/docs">
              {t("See supported workflows")}
            </a>
          </div>
        </div>
        <section className="repair-bench" aria-labelledby="bench-title">
          <header className="bench-header">
            <div>
              <img src="/goblin.svg" alt="" width="32" height="32" />
              <h2 id="bench-title">
                {t("A dependency repair, with receipts")}
              </h2>
            </div>
            <span>{t("Actual seeded lab \u00B7 Job #11")}</span>
          </header>
          <div className="bench-columns">
            <div className="bench-cell">
              <h3>
                <TriangleAlert size={17} aria-hidden="true" />
                {t("Before")}
              </h3>
              <p>{t("Pip resolver conflict")}</p>
              <pre aria-label={t("Original dependency pins")}>
                {t("requests==2.32.3")}
                {"\n"}
                <span className="bench-removed">{t("urllib3==1.20")}</span>
              </pre>
              <small>
                {t(
                  "The urllib3 pin fell below requests\u2019 minimum version.",
                )}
              </small>
            </div>
            <div className="bench-cell bench-patch">
              <h3>
                <GitPullRequest size={17} aria-hidden="true" />
                {t("The patch")}
              </h3>
              <p>
                <code>{t("requirements.txt")}</code>
              </p>
              <pre aria-label={t("Verified dependency change")}>
                <span className="bench-removed">
                  {t("\u2212 urllib3==1.20")}
                </span>
                {"\n"}
                <span className="bench-added">{t("+ urllib3>=1.21.1,<3")}</span>
              </pre>
              <small>
                {t("One dependency constraint. Original tests preserved.")}
              </small>
            </div>
            <div className="bench-cell">
              <h3>
                <CheckCircle2 size={17} aria-hidden="true" />
                {t("After")}
              </h3>
              <ul className="bench-results">
                <li>
                  <CheckCircle2 size={16} aria-hidden="true" />
                  {t("Dependency installation passed")}
                </li>
                <li>
                  <CheckCircle2 size={16} aria-hidden="true" />
                  {t("Six original tests passed")}
                </li>
                <li>
                  <CheckCircle2 size={16} aria-hidden="true" />
                  {t("Remote GitHub CI passed")}
                </li>
              </ul>
              <a
                href="https://github.com/wauul/patchgoblin-lab/pull/4"
                target="_blank"
                rel="noreferrer"
              >
                {t("Review repair PR #4")}
                <ArrowUpRight size={16} aria-hidden="true" />
              </a>
            </div>
          </div>
          <footer className="bench-footer">
            <span>
              {t(
                "Actual Groq run: 59.86s \u00B7 2 model calls \u00B7 5,576 tokens",
              )}
            </span>
            <span>{t("Human review before merge")}</span>
          </footer>
        </section>
        <div className="compatibility">
          <p>
            {t("Python")}
            <span>{t("pip / uv")}</span>
          </p>
          <p>
            {t("Node.js & TypeScript")}
            <span>{t("npm / pnpm / Yarn")}</span>
          </p>
          <p>
            {t("GitHub Actions")}
            <span>{t("Selected repository access")}</span>
          </p>
        </div>
      </section>
      <section className="landing-capabilities">
        <div className="section-introduction">
          <h2>
            {t("Three jobs")}
            <br />
            {t("One standard of proof")}
          </h2>
          <p>
            {t(
              "Inspect the repository. Execute its checks. Propose a change only when verification supports it.",
            )}
          </p>
        </div>
        <div className="capability-list">
          {getExamples().map(
            ({ Icon, name, description, result, href, label }) => (
              <article className="capability-row" key={name}>
                <div className="capability-title">
                  <Icon size={22} aria-hidden="true" />
                  <h3>{name}</h3>
                </div>
                <p>{description}</p>
                <div>
                  <small>
                    {t("Public lab example:")} {result}
                  </small>
                  <a href={href} target="_blank" rel="noreferrer">
                    {label}
                    <ArrowUpRight size={15} aria-hidden="true" />
                  </a>
                </div>
              </article>
            ),
          )}
        </div>
      </section>
      <section className="permissions-section">
        <div>
          <ShieldCheck size={28} aria-hidden="true" />
          <h2>
            {t("Your repositories")}
            <br />
            {t("Your review")}
          </h2>
          <p>
            {t(
              "Signing in identifies you. Installing the App selects access. Automation runs only when a repository administrator enables it.",
            )}
          </p>
          {install && (
            <a className="secondary" href={install}>
              {t("Install on GitHub")}
              <ArrowUpRight size={16} aria-hidden="true" />
            </a>
          )}
        </div>
        <ol>
          <li>
            <span>1</span>
            <div>
              <h3>{t("Connect your identity")}</h3>
              <p>
                {t(
                  "GitHub-only sign-in. Repository permissions stay separate.",
                )}
              </p>
            </div>
          </li>
          <li>
            <span>2</span>
            <div>
              <h3>{t("Select repository access")}</h3>
              <p>
                {t("Install the GitHub App on the repositories you choose.")}
              </p>
            </div>
          </li>
          <li>
            <span>3</span>
            <div>
              <h3>{t("Decide what runs")}</h3>
              <p>
                {t(
                  "Start jobs manually or enable bounded automation. Review every pull request.",
                )}
              </p>
            </div>
          </li>
        </ol>
      </section>
      <section className="landing-close">
        <img src="/goblin.svg" alt="" width="48" height="48" />
        <div>
          <h2>{t("Put evidence behind your next patch")}</h2>
          <p>
            {t(
              "Selected repositories. Original checks. A reviewable pull request.",
            )}
          </p>
        </div>
        <a className="primary" href={login}>
          <Github size={18} aria-hidden="true" />
          {action}
        </a>
      </section>
    </>
  );
}
