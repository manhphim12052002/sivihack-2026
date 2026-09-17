import { runRuleMatcher } from "./rule-matcher";
import { runOntologyMatcher } from "./ontology-matcher";
import { runSemanticMatcher } from "./semantic-matcher";
import { runReferenceMatcher } from "./reference-matcher";
import type { MatchingTask, MatchResult, CanonicalCompany } from "./types";

export async function routeAndRun(
  task: MatchingTask,
  company: CanonicalCompany,
): Promise<MatchResult> {
  switch (task.matcher_type) {
    case "RULE":
      return runRuleMatcher(task, company);
    case "ONTOLOGY":
      return runOntologyMatcher(task, company);
    case "SEMANTIC":
      return runSemanticMatcher(task, company);
    case "REFERENCE":
      return runReferenceMatcher(task, company);
    default:
      return runRuleMatcher(task, company);
  }
}
