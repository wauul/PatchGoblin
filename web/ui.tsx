import { t } from "./locale";
import React from "react";
import * as Select from "@radix-ui/react-select";
import * as Tabs from "@radix-ui/react-tabs";
import * as Menu from "@radix-ui/react-dropdown-menu";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Menu as MenuIcon,
  CheckCircle2,
  Clock,
  TriangleAlert,
  XCircle,
} from "lucide-react";
export type Option = {
  value: string;
  label: string;
  disabled?: boolean;
};
export function Picker({
  label,
  value,
  onChange,
  options,
  placeholder = t("Choose an option"),
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <span className="picker">
      <select
        className="native-picker"
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {options.map((option) => (
          <option
            key={option.value}
            value={option.value}
            disabled={option.disabled}
          >
            {option.label}
          </option>
        ))}
      </select>
      <Select.Root value={value} onValueChange={onChange} disabled={disabled}>
        <Select.Trigger className="picker-trigger" aria-label={label}>
          <Select.Value placeholder={placeholder} />
          <Select.Icon>
            <ChevronDown size={16} aria-hidden="true" />
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content
            className="picker-content"
            position="popper"
            sideOffset={6}
            collisionPadding={12}
          >
            <Select.ScrollUpButton className="picker-scroll">
              <ChevronUp size={16} aria-hidden="true" />
            </Select.ScrollUpButton>
            <Select.Viewport>
              {options.map((option) => (
                <Select.Item
                  key={option.value}
                  value={option.value}
                  disabled={option.disabled}
                  className="picker-item"
                >
                  <Select.ItemText>{option.label}</Select.ItemText>
                  <Select.ItemIndicator>
                    <Check size={16} aria-hidden="true" />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.Viewport>
            <Select.ScrollDownButton className="picker-scroll">
              <ChevronDown size={16} aria-hidden="true" />
            </Select.ScrollDownButton>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
    </span>
  );
}
export function EvidenceTabs({
  value,
  onChange,
  counts,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  counts: Record<string, number | undefined>;
  children: React.ReactNode;
}) {
  const labels = [
    ["diagnosis", "Diagnosis"],
    ["diff", t("Diff")],
    ["verification", "Verification"],
    ["coverage", t("Coverage")],
  ];
  return (
    <Tabs.Root value={value} onValueChange={onChange} className="evidence-tabs">
      <Tabs.List className="tabs" aria-label={t("Job evidence")}>
        {labels.map(([id, label]) => (
          <Tabs.Trigger key={id} value={id} className="tab">
            {t(label)}
            {counts[id] !== undefined && (
              <span
                className="tab-count"
                aria-label={`${counts[id]} ${t(id === "verification" ? "sandbox checks" : id === "coverage" ? "packages" : "evidence items")}`}
              >
                {counts[id]}
              </span>
            )}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
      {labels.map(([id]) => (
        <Tabs.Content key={id} value={id} className="tab-content" tabIndex={0}>
          {value === id && children}
        </Tabs.Content>
      ))}
    </Tabs.Root>
  );
}
export function PublicMenu({ action, href }: { action: string; href: string }) {
  return (
    <Menu.Root>
      <Menu.Trigger asChild>
        <button
          className="icon-button mobile-public-menu"
          aria-label={t("Open site navigation")}
        >
          <MenuIcon size={20} aria-hidden="true" />
        </button>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content className="menu-content" sideOffset={8} align="end">
          <Menu.Label className="menu-label">PatchGoblin</Menu.Label>
          {[
            ["/docs", "Documentation"],
            ["/extension", "Extension"],
            ["/faq", "FAQ"],
            ["/support", "Support"],
            [href, action],
          ].map(([href, text]) => (
            <Menu.Item asChild key={href}>
              <a className="menu-item" href={href}>
                {t(text)}
              </a>
            </Menu.Item>
          ))}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
export const titleCase = (value: string) =>
  t(
    value
      .replaceAll("_", " ")
      .replace(/\b\w/g, (character) => character.toUpperCase()),
  );
export function Status({ value }: { value: string }) {
  const Icon = ["submitted", "verified", "success"].includes(value)
    ? CheckCircle2
    : ["failed", "failure", "unsupported"].includes(value)
      ? TriangleAlert
      : value === "cancelled"
        ? XCircle
        : Clock;
  return (
    <span className={`status ${value}`}>
      <Icon size={14} aria-hidden="true" />
      {titleCase(value)}
    </span>
  );
}
export function StageRail({ job }: { job: any }) {
  const stages = [
    "inspect",
    "reproduce",
    "investigate",
    "patch",
    "verify",
    "submit",
  ];
  const index =
    job.status === "submitted"
      ? 6
      : job.status === "verified"
        ? 5
        : Math.max(
            stages.indexOf(job.status),
            ...(job.events || []).map((event: any) =>
              stages.indexOf(event.stage),
            ),
          );
  const stopped = ["failed", "unsupported", "cancelled"].includes(job.status);
  return (
    <ol className="pipeline" aria-label={t("Agent stages")}>
      {stages.map((stage, i) => {
        const state =
          i < index
            ? "done"
            : i === index
              ? stopped
                ? "stopped"
                : "current"
              : "pending";
        return (
          <li
            className={`stage ${state}`}
            key={stage}
            aria-current={state === "current" ? "step" : undefined}
          >
            <span className="stage-mark" aria-hidden="true">
              {state === "done" ? <Check size={14} /> : i + 1}
            </span>
            <span>{titleCase(stage)}</span>
            <span className="sr-only">
              : {t(state === "done" ? "complete" : state)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
export function LoadingWorkspace() {
  return (
    <main className="loading-workspace" aria-busy="true">
      <h1>{t("Loading your workspace")}</h1>
      <p role="status">
        {t("Checking your GitHub session and repository access.")}
      </p>
      <div className="skeleton-grid" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div className="skeleton-table" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </main>
  );
}
export function ReadingFrame({
  children,
  page,
}: {
  children: React.ReactNode;
  page: string;
}) {
  return (
    <main id="content" className="reading-layout">
      <aside className="reading-nav">
        <h2>{t("Field guide")}</h2>
        <nav aria-label={t("Documentation pages")}>
          {[
            ["docs", "Documentation"],
            ["extension", "Extension"],
            ["faq", "FAQ"],
            ["support", "Support"],
            ["privacy", "Privacy"],
            ["terms", "Terms"],
          ].map(([id, label]) => (
            <a
              href={`/${id}`}
              key={id}
              aria-current={id === page ? "page" : undefined}
            >
              {t(label)}
            </a>
          ))}
        </nav>
        <p>
          {t(
            "Supported workflows, explicit permissions, evidence you can review.",
          )}
        </p>
      </aside>
      <article className="information">{children}</article>
    </main>
  );
}
