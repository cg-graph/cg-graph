import {dblp_stream, max_snapshot_age, snapshot_version} from "./config.js";


export class Author {
    type = "author";
    id;
    name;
    publications = [];
    latest_publication = undefined;

    constructor(id, name, publications = [], latest_publication = undefined) {
        this.id = id;
        this.name = name;
        this.publications = publications;
        this.latest_publication = latest_publication;
        console.assert(id && name, "Both Author.id and Author.name must be defined. Got:", id, name);
    }
}

export class Publication {
    type = "publication";
    id;
    title;
    venue;
    year;
    dblp_key;
    doi;
    authors;

    constructor(id, title, venue, year, dblp_key = undefined, doi = undefined, authors = []) {
        this.id = id;
        this.title = title;
        this.venue = venue;
        this.year = year;
        this.dblp_key = dblp_key;
        this.doi = doi;
        this.authors = authors;
    }

}


export class Snapshot {
    static version = snapshot_version;

    static #dblp_mirror = ["https://dblp.org", "https://dblp.uni-trier.de", "https://dblp.dagstuhl.de"]
    static #dblp_active_mirror = 1;

    static DBLPMirror(cycle = 0) {
        if (cycle) {
            Snapshot.#dblp_active_mirror = (Snapshot.#dblp_active_mirror + cycle) % Snapshot.#dblp_mirror.length;
            console.debug("Switched DBLP mirror to ", Snapshot.#dblp_mirror[Snapshot.#dblp_active_mirror]);
        }
        return Snapshot.#dblp_mirror[Snapshot.#dblp_active_mirror]
    }

    #db = null;

    #statusPopup;
    #loadingBar;
    #loadingStatus;

    // Returns the SQLite Database handle.
    DB() {
        return this.#db;
    }

    ComputeKeyStats() {
        const query = this.#db.prepare(`
            SELECT (SELECT COUNT(*) FROM author)      as num_authors,
                   (SELECT COUNT(*) FROM publication) as num_publications,
                   (SELECT MIN(year) FROM edition)    as first_year,
                   (SELECT MAX(year) FROM edition)    as last_year;`);
        const output = {
            authors: NaN,
            publications: NaN,
            first_year: NaN,
            last_year: NaN,
            year: NaN
        };
        if(query.step()) {
            [output.authors, output.publications, output.first_year, output.last_year] = query.get();
            output.years = output.last_year - output.first_year + 1;
            output.first_year = output.first_year.toString();
            output.last_year = output.last_year.toString();
        }
        return output;
    }

    CountPapers(author) {
        const query = this.#db.prepare(`
            SELECT COUNT(author)
            FROM author_of
            WHERE author_of.author = :author;
        `);
        query.bind({':author': author});
        if (query.step()) {
            return query.get()[0];
        }
        return 0;
    }

    RangeOfYears() {
        const query = this.#db.prepare(`
            SELECT MIN(year), MAX(year)
            FROM publication;
        `);
        let out = {min:1970, max: 2100};
        if (query.step()) {
            out.min = query.get()[0];
            out.max = query.get()[1];
        }
        return out;
    }


    constructor(statusPopup = null) {
        if (!statusPopup) {
            return this.#statusPopup;
        } else {
            this.#statusPopup = statusPopup;
            this.#loadingBar = statusPopup.querySelector(".loading-bar");
            this.#loadingStatus = statusPopup.querySelector(".loading-label");
        }
    }

    // Loads sql.js, retrieves snapshot.sqlite from local storage (or creates it).
    async Initialize() {
        let t0 = Date.now();
        // Asynchronous initialization of sql.js from WASM
        const sql = await initSqlJs({locateFile: file => `js/lib/${file}`});
        console.debug(`Initialized SQLite library in ${Date.now() - t0}ms.`)
        this.#setLoadingBarWidth(33)
        t0 = Date.now();
        // Load base64-encoded sqlite blob into a database
        const buffer = Uint8Array.fromBase64(localStorage.getItem("snapshot.sqlite") ?? "") ?? [];
        this.#setLoadingBarWidth(66)
        t0 = Date.now();
        // Load buffer into sql.js
        this.#db = new sql.Database(new Uint8Array(buffer));
        this.#createSchemaIfMissing();
        this.#setStatusPopupVisible(false)
        console.debug(`Initialized snapshot.sqlite in ${Date.now() - t0}ms.`)
        await this.Update()
        const range = this.RangeOfYears();
        console.debug(`Snapshot covers years ${range.min} to ${range.max}.`)
    }

    Age() {
        return Date.now() - parseInt(localStorage.getItem("snapshot.from") ?? "0");
    }

    StoredVersion() {
        return localStorage.getItem("snapshot.version") ?? "0.0.0";
    }

    Save() {
        localStorage.setItem("snapshot.from", Date.now().toString());
        localStorage.setItem("snapshot.version", Snapshot.version);
        localStorage.setItem("snapshot.sqlite", this.#db.export().toBase64());
    }

    Destroy() {
        localStorage.removeItem("snapshot.from");
        localStorage.removeItem("snapshot.sqlite");
        localStorage.removeItem("snapshot.version");
    }

    async #QueryDBLP(stream, num, first, statusNode) {
        let url = `${Snapshot.DBLPMirror()}/search/publ/api?q=${stream}&h=${num}&f=${first}&format=jsonp`
        let response = null;
        while (!response || !response.ok) {
            try {
                if (response) {
                    statusNode.innerText = "waiting";
                    await new Promise(r => setTimeout(r, 3000));
                    statusNode.innerText = "retrying";
                } else {
                    statusNode.innerText = "fetch";
                }
                url = `${Snapshot.DBLPMirror(response ? 1 : 0)}/search/publ/api?q=${stream}&h=${num}&f=${first}&format=jsonp`
                if(this.#loadingBar) {
                    this.#loadingBar.innerHTML = Snapshot.DBLPMirror();
                }
                response = await fetch(url);
                statusNode.innerText = response.ok ? "done" : "failed";
            } catch (error) {
                statusNode.innerText = "failed";
                console.error(error);
                response = {ok: false};
                await new Promise(r => setTimeout(r, 1000));
            }
        }
        if(this.#loadingBar) {
            this.#loadingBar.innerHTML = "";
        }
        return response.text();
    }


    #setStatusPopupVisible(visible) {
        this.#statusPopup.style.display = visible ? "flex" : "none";
    }

    #setLoadingBarWidth(percent) {
        if (this.#loadingBar && percent !== null) {
            this.#loadingBar.style.width = percent + "%";
        }
    }

    #setProgressAndStatus(target, stage, status, percent) {
        this.#setLoadingBarWidth(percent);
        if (this.#loadingStatus) {
            this.#loadingStatus.innerHTML = `Loading dataset ${target} <span class="progress">${stage}</span> [<span class="status">${status}</span>]`;
        }
    }

    async Update(max_age = max_snapshot_age) {
        let snapshotAge = this.Age();
        if (Snapshot.version !== this.StoredVersion()) {
            this.#dropEverything();
            this.#createSchemaIfMissing();
            snapshotAge = max_age;
        }
        console.debug(`SQLite snapshot is ${Math.floor(snapshotAge / (60 * 60 * 1000))}h ${Math.floor(snapshotAge % (60 * 60 * 1000) / (60 * 1000))}m old.`)
        if (snapshotAge >= max_age) {
            const t0 = Date.now();
            console.log("Refreshing snapshot...")
            for (const streamName in dblp_stream) {
                const streamID = dblp_stream[streamName];
                this.#setStatusPopupVisible(true);
                const pageSize = 1000;
                let total = Infinity;
                let received = 0;
                while (received < total) {
                    this.#setProgressAndStatus(streamName, received ? `(${received} / ${total})` : "...", null, (100.0 * received) / total);
                    const raw = await this.#QueryDBLP(streamID, pageSize, received, this.#loadingStatus.querySelector(".status"));
                    const data = JSON.parse(raw);
                    const received_now = parseInt(data.result.hits["@sent"]);
                    total = parseInt(data.result.hits["@total"]);
                    console.debug(`DBLP time: ${data.result.time.text}${data.result.time['@unit']}`)
                    received += received_now;
                    this.#setProgressAndStatus(streamName, received ? `(${received} / ${total})` : "...", "processing", (100.0 * received) / total);
                    try {
                        this.#AppendFromJson(data);
                    } catch (e) {
                        console.error(e);
                        console.error(data);
                        await new Promise(r => setTimeout(r, 2000));
                    }
                }
            }
            this.Save();
            this.#setStatusPopupVisible(false);
            console.log(`Completed in ${Date.now() - t0}ms.`);
            return true;
        }
        return false;
    }

// Attempts to remove the collision index from DBLP names
    static #stripCollisionIndex(authorname) {
        if (authorname.length > 4) {
            const collisionexpression = /.* [0-9]{4}/
            if (authorname.match(collisionexpression)) {
                return authorname.substring(0, authorname.length - 5);
            }
        }
        return authorname;
    }

    #AppendFromJson(json) {
        const stmt_create_edition = this.#db.prepare("INSERT OR IGNORE INTO edition (name,year) VALUES (:name,:year);");
        const stmt_create_author = this.#db.prepare("INSERT OR IGNORE INTO author (name,id) VALUES (:name,:id);");
        const stmt_create_publication = this.#db.prepare("INSERT OR IGNORE INTO publication (title,year,venue,dblp_key,doi) VALUES (:title,:year,:venue,:dblp_key,:doi) RETURNING id;");
        const stmt_create_author_of = this.#db.prepare("INSERT OR IGNORE INTO author_of (author,publication) VALUES (:author,:publication);");

        let result;
        if (json.hasOwnProperty("result")) {
            result = json.result;
        } else {
            result = json;
        }
        console.assert(result.status && result.status['@code'] === '200', result);
        const arr_hit = Array.isArray(result.hits.hit) ? result.hits.hit : [result.hits.hit];
        for (const hit of arr_hit) {
            const pub = hit['info'];
            if (pub.type === "Editorship") {
                continue;
            }
            if (!pub.hasOwnProperty("authors")) {
                console.debug(`Adding empty dummy author list:`, pub);
                pub.authors = {author: []};
            }
            if(pub.title.at(pub.title.length-1) === '.') {
                pub.title = pub.title.substring(0, pub.title.length - 1);
            }
            const pub_info = {
                ':title': pub.title,
                ':year': parseInt(pub.year),
                ':venue': pub.venue,
                ':dblp_key': pub.key ?? null,
                ':doi': pub.doi ?? null,
            }
            stmt_create_edition.run({
                ':year': pub_info[":year"], ':name': pub_info[":venue"]
            });
            stmt_create_publication.reset();
            stmt_create_publication.bind(pub_info);
            if (!stmt_create_publication.step()) {
                console.debug("Attempted to insert duplicate publication.");
                continue;
            }
            const pub_id = stmt_create_publication.get()[0];
            const arr_author = Array.isArray(pub.authors.author) ? pub.authors.author : [pub.authors.author];
            for (const author of arr_author) {
                stmt_create_author.run({
                    ':name': Snapshot.#stripCollisionIndex(author['text']),
                    ':id': author['@pid']
                });
                stmt_create_author_of.run({
                    ':author': author['@pid'], ':publication': pub_id
                });
            }
        }
    }

    #dropEverything() {
        const drop_tables = `
PRAGMA writable_schema = 1;
delete from sqlite_master where type in ('table', 'index', 'trigger', 'view');
PRAGMA writable_schema = 0;
VACUUM;
PRAGMA INTEGRITY_CHECK;
`
        this.#db.run(drop_tables);
    }

    #createSchemaIfMissing() {
        const schema_author = "CREATE TABLE IF NOT EXISTS author (id varchar(128) primary key, name text, affiliation text);";
        const schema_edition = "CREATE TABLE IF NOT EXISTS edition (name varchar(8), year int, primary key(name,year));";
        const schema_publication = `
            CREATE TABLE IF NOT EXISTS publication
            (
                id       integer primary key autoincrement,
                title    text,
                year     int,
                venue    varchar(8),
                dblp_key varchar(64) unique,
                doi      varchar(128),
                FOREIGN KEY (venue, year) REFERENCES edition (name, year)
            );
            CREATE INDEX IF NOT EXISTS publication_year ON publication (year);`;
        const schema_author_of = `
            CREATE TABLE IF NOT EXISTS author_of
            (
                author      varchar(128),
                publication int,
                FOREIGN KEY (author) REFERENCES author (id),
                FOREIGN KEY (publication) REFERENCES publication (id),
                UNIQUE (author, publication)
            );`;
        this.#db.run(schema_edition);
        this.#db.run(schema_author);
        this.#db.run(schema_publication);
        this.#db.run(schema_author_of);

        const schema_author_of_in_year = `
        CREATE VIEW IF NOT EXISTS author_of_in AS
        SELECT author_of.publication AS publication, author_of.author AS author, publication.year AS year, publication.venue AS venue
        FROM author_of
            INNER JOIN publication
            ON author_of.publication = publication.id;`;
        this.#db.run(schema_author_of_in_year);

        const schema_coauthor_on = `
    CREATE VIEW IF NOT EXISTS coauthor_on AS
        SELECT A.author AS author1, B.author AS author2, A.publication AS publication, author_of.year AS year, author_of.venue AS venue
        FROM author_of A, author_of B
            WHERE A.publication = B.publication
            AND A.author <> B.author;`;
        this.#db.run(schema_coauthor_on);

        const schema_coauthor_on_in_year = `
    CREATE VIEW IF NOT EXISTS coauthor_on_in AS
        SELECT A.author AS author1, B.author AS author2, A.publication AS publication, A.year AS year, A.venue AS venue
        FROM author_of_in A, author_of_in B
            WHERE A.publication = B.publication
            AND A.author <> B.author;`;
        this.#db.run(schema_coauthor_on_in_year);
    }
}