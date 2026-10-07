"""In-memory decision graph. No checkpoints or automatic content tracing."""
from typing import TypedDict

from langchain_core.runnables import RunnableLambda
from langgraph.graph import END, START, StateGraph
from langsmith import tracing_context


class DecisionState(TypedDict, total=False):
    evidence: dict
    prepared: dict
    response: dict
    decision: dict


def build_graph(model):
    graph = StateGraph(DecisionState)
    graph.add_node("prepare", RunnableLambda(lambda s: {"prepared": model._prepare(s["evidence"])}))
    graph.add_node("infer", RunnableLambda(lambda s: {"response": model._infer(s["prepared"])}))
    graph.add_node("validate", RunnableLambda(
        lambda s: {"decision": model._parse(s["prepared"], s["response"])}))
    graph.add_edge(START, "prepare")
    graph.add_edge("prepare", "infer")
    graph.add_edge("infer", "validate")
    graph.add_edge("validate", END)
    return graph.compile()


def decide(graph, evidence):
    # LangSmith environment flags must never export repository files/logs.
    with tracing_context(enabled=False):
        return graph.invoke({"evidence": evidence}, config={"callbacks": [], "recursion_limit": 5})["decision"]
