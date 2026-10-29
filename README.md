# Stratabench — website, customer portal and engineering CRM

Static site served by GitHub Pages at https://stratabench.com, backed by Supabase (auth, Postgres with row-level security, private file storage).

- `index.html` — public site with test-requirement, callback and feedback forms (write-only to `inquiries`)
- `login.html` — single sign-in; routes customers to the portal and staff to the CRM
- `portal.html` — customer portal: projects, shared documents, 3D/PDF viewer, messages
- `crm.html` — staff workspace: inbox, companies, contacts, pipeline, projects, documents, tasks, messages, users
- `js/viewer.js` — three.js viewer (STEP/IGES/BREP via occt-import-js, STL/OBJ/glTF/GLB/3MF/PLY) and pdf.js reader
- Large uploads use resumable TUS uploads directly to Supabase Storage.

Accounts are created by staff only; there is no public sign-up.
