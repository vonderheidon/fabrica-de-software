# Triage labels

Use this configuration when the triage skill is available in the agent environment. Skills are supplied by that environment, never installed by scaffold.

| Canonical role | Tracker label | Meaning |
| --- | --- | --- |
| needs-triage | needs-triage | Maintainer evaluation required |
| needs-info | needs-info | Reporter information required |
| ready-for-agent | ready-for-agent | Fully specified work for an agent |
| ready-for-human | ready-for-human | Human implementation required |
| wontfix | wontfix | Work will not be actioned |

Map these roles to existing labels when necessary. Creating missing labels requires explicit remote authorization. This vocabulary does not grant execution authority or replace Ready, assignee and Project gates.
