import {author_halflife, publication_halflife} from "./config.js";
import {Author, Publication} from "./snapshot.js";

let t0 = null, t1 = null;

function debug_timer_stop(label = null) {
    /* if (t0 && label) {
        t1 = Date.now();
        console.debug(`${t1 - t0}ms for ${label}.`);
        t0 = t1;
    } else {
        t0 = Date.now();
    }*/
}

function expDecay(time, halfLife = 5, bias = 0.1) {
    return bias + (0.5 ** (Math.abs(time) / halfLife)) * (1 - bias);
}

export class DataSlice {
    Filter = {
        Venue: (venue) => 1,
        MinYear: 1985,
        MaxYear: new Date().getFullYear(),
    }

    #snapshot;

    Data = {
        nodes: [], // Nodes of current view
        links: [], // Links of current view
        author: {},
        publication: {},
        author_of: {},
        coauthor: {},
        first_year: undefined,
        last_year: undefined,
    };

    constructor(snapshot) {
        snapshot.DB().create_function("filter_venue", (venue) => this.Filter.Venue(venue));
        this.#snapshot = snapshot;
    }

    Fetch() {
        const db = this.#snapshot.DB();
        const query_interval = {
            ':first_year': this.Filter.MinYear,
            ':last_year': this.Filter.MaxYear
        };
        console.debug(`Fetching ${this.Filter.MinYear} to ${this.Filter.MaxYear}.`)
        const output = {
            author: {},
            publication: {},
            author_of: {},
            coauthor: {},
            first_year: this.Filter.MinYear,
            last_year: this.Filter.MaxYear
        };

        debug_timer_stop();
        const active_authors = db.prepare(`
            SELECT author.id, author.name
            FROM author
            WHERE EXISTS (SELECT 1
                          FROM author_of_in
                          WHERE author.id = author_of_in.author
                            AND author_of_in.year BETWEEN :first_year AND :last_year
                            AND filter_venue(author_of_in.venue) = 1);`);
        active_authors.bind(query_interval);
        while (active_authors.step()) {
            const [id, name] = active_authors.get();
            output.author[id] = new Author(id, name);
        }
        debug_timer_stop('author');

        const publications_for_interval = db.prepare(`
            SELECT id, title, venue, year, dblp_key, doi
            FROM publication
            WHERE publication.year BETWEEN :first_year AND :last_year
              AND filter_venue(publication.venue) = 1;`);
        publications_for_interval.bind(query_interval);
        while (publications_for_interval.step()) {
            const row = publications_for_interval.get();
            output.publication[row[0]] = new Publication(...row)
        }
        debug_timer_stop('publication');


        const author_of_for_interval = db.prepare(`
            SELECT publication, author
            FROM author_of_in
            WHERE author_of_in.year BETWEEN :first_year AND :last_year
              AND filter_venue(author_of_in.venue) = 1;
        `);
        author_of_for_interval.bind(query_interval);
        while (author_of_for_interval.step()) {
            const [pub_id, aut_id] = author_of_for_interval.get();
            const author = output.author[aut_id];
            author.publications.push(pub_id);
            const publication = output.publication[pub_id];
            publication.authors.push(aut_id);
            output.author_of[pub_id + aut_id] = {
                id: pub_id + aut_id,
                author: aut_id,
                publication: pub_id,
                source: aut_id,
                target: pub_id,
                type: 'author_of'
            };
        }
        debug_timer_stop('author_of');

        const coauthors_for_interval = db.prepare(`
            SELECT A.author as author1, B.author as author2, A.publication as publication
            FROM (SELECT *
                  FROM author_of_in
                  WHERE year BETWEEN :first_year AND :last_year) as A
                     JOIN
                 (SELECT *
                  FROM author_of_in
                  WHERE year BETWEEN :first_year AND :last_year) as B
            ON A.publication = B.publication
              AND A.author < B.author
              AND filter_venue(A.venue) = 1;
        `);
        coauthors_for_interval.bind(query_interval);
        while (coauthors_for_interval.step()) {
            const [author1, author2, publication] = coauthors_for_interval.get();
            let relation = output.coauthor[author1 + author2] ?? {
                id: author1 + author2,
                type: 'coauthor',
                author1: author1,
                source: author1,
                author2: author2,
                target: author2,
                publications: []
            };
            relation.publications.push(publication);
            output.coauthor[relation.id] = relation;
        }
        debug_timer_stop('coauthor');
        this.Data = output;
        this.#Annotate();
        debug_timer_stop('annotate');
        return this.Data;
    }

    #Annotate() {
        for (const key in this.Data.publication) {
            const publication = this.Data.publication[key];
            publication.activityScore = expDecay(publication.year - this.Data.last_year, publication_halflife);
        }
        for (const key in this.Data.author_of) {
            const author_of = this.Data.author_of[key];
            const publication = this.Data.publication[author_of.publication];
            const author = this.Data.author[author_of.author];
            if (!author.latest_publication || author.latest_publication.year < publication.year) {
                author.latest_publication = publication;
            }
            author_of.activityScore = expDecay(publication.year - this.Data.last_year, publication_halflife);
        }
        for (const key in this.Data.author) {
            const author = this.Data.author[key];
            author.activityScore = expDecay(author.latest_publication.year - this.Data.last_year, author_halflife);
        }
        for (const key in this.Data.coauthor) {
            const coauthor = this.Data.coauthor[key];
            coauthor.activityScore = expDecay(Math.max(...coauthor.publications.map(pub => this.Data.publication[pub].year)) - this.Data.last_year, publication_halflife);
        }
    }

    CountPapersInVenue(author) {
        const query = this.#snapshot.DB().prepare(`
            SELECT COUNT(author)
            FROM author_of_in
            WHERE author_of_in.author = :author
              AND filter_venue(author_of_in.venue) = 1;
        `);
        query.bind({':author': author});
        if (query.step()) {
            return query.get()[0];
        }
        return 0;
    }

    CountJointPapersInVenue(author1, author2) {
        const query_ids = this.#snapshot.DB().prepare(`
            SELECT COUNT(publication)
            FROM coauthor_on_in
            WHERE author1 = :author1
              AND author2 = :author2
              AND filter_venue(coauthor_on_in.venue) = 1;`);
        query_ids.bind({':author1': author1, ':author2': author2});
        if(query_ids.step()) {
            return query_ids.get()[0];
        }
        return 0;
    }

    JointPapersInVenue(author1, author2) {
        const query_ids = this.#snapshot.DB().prepare(`
            SELECT publication
            FROM coauthor_on_in
            WHERE author1 = :author1
              AND author2 = :author2
              AND filter_venue(coauthor_on_in.venue) = 1
            ORDER BY year DESC;`)
        const query_details = this.#snapshot.DB().prepare("SELECT id, title, venue, year, dblp_key, doi FROM publication WHERE id = :publication");
        const publications = [];
        query_ids.bind({':author1': author1, ':author2': author2});
        while(query_ids.step()) {
            const pub_id = query_ids.get()[0];
            if(this.Data.publication.hasOwnProperty(pub_id)) {
                publications.push(this.Data.publication[pub_id]);
            } else {
                query_details.bind({':publication': pub_id});
                if (query_details.step()) {
                    publications.push(new Publication(...query_details.get()));
                } else {
                    console.error("Failed to look up publication", pub_id);
                }
            }
        }
        return publications;
    }


    CoauthorsInVenue(author) {
        const query_ids = this.#snapshot.DB().prepare(`
            SELECT author2, COUNT(author2)
            FROM coauthor_on_in
            WHERE coauthor_on_in.author1 = :author
              AND filter_venue(coauthor_on_in.venue) = 1
            GROUP BY author2
            ORDER BY COUNT(author2) DESC;`);
        query_ids.bind({':author': author});
        const ids = [];
        while (query_ids.step()) {
            ids.push(query_ids.get());
        }
        const query_details = this.#snapshot.DB().prepare("SELECT * FROM author WHERE id = :author");
        const authors = [];
        for (const [id, count] of ids) {
            if(this.Data.author.hasOwnProperty(id)) {
                authors.push({author: this.Data.author[id], count: count});
            } else {
                query_details.bind({':author': id});
                if (query_details.step()) {
                    authors.push({author: new Author(...query_details.get()), count: count});
                } else {
                    console.error("Failed to look up author", id);
                }
            }
        }
        return authors;
    }

    static LooksLikeDataSet(dataset) {
        const data_ranges = ["author", "publication", "coauthor", "author_of"];
        return dataset && data_ranges.every(range => dataset.hasOwnProperty(range));
    }


    #FilteredData = new Set();
    #FilterQuery = null; // all-lowercase query string

    #queryMatchesAuthor(author) {
        if (!this.#FilterQuery || !author) return false;
        return (author.id ?? "").toLowerCase().includes(this.#FilterQuery)
            || author.name.toLowerCase().includes(this.#FilterQuery)
            || (author.affiliation && author.affiliation.toLowerCase().includes(this.#FilterQuery));
    }

    #querymatchesPublication(publication) {
        if (!this.#FilterQuery) return false;
        return (publication.dblp_key ?? "").toLowerCase().includes(this.#FilterQuery)
            || publication.title.toLowerCase().includes(this.#FilterQuery)
            || publication.authors.map(id => this.Data.author[id]).some(author => this.#queryMatchesAuthor(author))
            || publication.year === parseInt(this.#FilterQuery)
            || publication.venue.toLowerCase().includes(this.#FilterQuery);
    }

    SearchQuery(query = null) {
        if (query !== null) {
            this.#FilterQuery = query.toLowerCase();
            this.#FilteredData.clear();
            if (this.#FilterQuery && this.#FilterQuery.length > 0) {
                const scan = this.Data.nodes.concat(this.Data.links);
                for (const datapoint of scan) {
                    if (datapoint.type === "author") {
                        if (this.#queryMatchesAuthor(datapoint)) {
                            this.#FilteredData.add(datapoint.id)
                        }
                    } else if (datapoint.type === "publication") {
                        if (this.#querymatchesPublication(datapoint)) {
                            this.#FilteredData.add(datapoint.id)
                        }
                    } else if (datapoint.type === "author_of") {
                        if (this.#queryMatchesAuthor(this.Data.author[datapoint.author])) {
                            this.#FilteredData.add(datapoint.id)
                        } else if (this.#querymatchesPublication(this.Data.publication[datapoint.publication])) {
                            this.#FilteredData.add(datapoint.id)
                        }
                    } else if (datapoint.type === "coauthor") {
                        if (this.#queryMatchesAuthor(this.Data.author[datapoint.author1])) {
                            this.#FilteredData.add(datapoint.id)
                        } else if (this.#queryMatchesAuthor(this.Data.author[datapoint.author2])) {
                            this.#FilteredData.add(datapoint.id)
                        }
                    }
                }
            } else {
                this.#FilterQuery = null;
            }
        }
        return this.#FilterQuery;
    }

    MatchesQuery(identifier) {
        return !this.SearchQuery() || this.#FilteredData.has(identifier);
    }

    NumQueryResults() {
        return this.#FilteredData.size;
    }

}