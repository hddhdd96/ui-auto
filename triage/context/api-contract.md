Demo volume service contract (from demo/server.mjs, services/volume-client.ts and README; not written for any specific failure)

UI
- /login: username/password form. /volumes: volume table (Name, Status, Size, Delete button per row) and "Create volume" dialog with "Volume name" and "Size (GiB)" inputs (number, min 1).
- Without a valid session, /volumes redirects to /login.

API (session cookie required except /api/login)
- POST /api/login {username, password} -> 200 and session cookie; 401 for wrong credentials.
- GET /api/me -> 200 {user}; 401 "Authentication required" when the session is missing or unknown.
- GET /api/v1/volumes[?name=] -> 200 array of {id, name, sizeGiB, status, bootable}. Names are unique, so a name appears at most once.
- POST /api/v1/volumes {name: non-empty string, sizeGiB: positive integer} -> 201 volume.
  - The stored name and sizeGiB equal the request; status is "ACTIVE" (uppercase, exact); bootable is true.
  - 400 when name is empty or sizeGiB is not a positive integer; 409 "Duplicate name" when the name already exists.
- DELETE /api/v1/volumes/{id} -> 204 and the volume is gone from later GETs; 404 for an unknown id.
- No other /api paths exist; any other path returns 404 "Unknown endpoint".
- 5xx is never an expected response.
