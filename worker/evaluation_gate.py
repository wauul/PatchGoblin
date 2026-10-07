"""Strict release gate for fresh inference evaluation reports."""


def failures(cases):
    if not cases:
        return ["Evaluation contains no cases"]
    issues = []
    ids = [case.get("id") for case in cases]
    if any(not isinstance(case_id, str) or not case_id for case_id in ids) or len(set(ids)) != len(ids):
        issues.append("Evaluation case IDs are missing or duplicated")
    for case in cases:
        if case.get("oracle_pass") is not True:
            issues.append(f"{case.get('id', 'unknown')}: independent acceptance check failed")
        if case.get("incorrect_repair") is not False:
            issues.append(f"{case.get('id', 'unknown')}: incorrect-repair guard failed or missing")
    return issues
