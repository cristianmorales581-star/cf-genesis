# Architecture decisions

- ODC/ODV person type comes from each counterparty record; ODC market is secondary only when generated after issuance, and document currency remains USD, to preserve the approved trading rules consistently across individual and batch generation.
- Calendar daily detail reuses the Emisiones view with a server-side date scope; standalone vector exports reuse buildVectorRow/buildVectorXlsx to keep table capabilities and document formats consistent.
- Daily signing state is persisted separately from financial emission state with staff-only write policies, so document tracking cannot grant emission editing rights.