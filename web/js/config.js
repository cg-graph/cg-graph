export const dblp_stream = {
    SoCG: "stream%3Astreams%2Fconf%2Fcompgeom%3A",
    /*CCCG: "stream%3Astreams%2Fconf%2Fcccg%3A",
    JoCG: "stream%3Astreams%2Fjournals%2Fjocg%3A"*/
};

export const snapshot_version = "0.0.8";
// default: 3 days.
export const max_snapshot_age = 3 * 24 * 60 * 60 * 1000;

export const venue_filter = {
    SoCG: (venue) => /So?CG/.test(venue) ? 1 : 0,
    /*All: (venue) => 1,
    CCCG: (venue) => /CCCG/.test(venue) ? 1 : 0,
    JoCG: (venue) => /J\. Comput\. Geom\./.test(venue) ? 1 : 0*/
}

export const color_scheme = {
    author_of: {
        light: "#888888aa", dark: "#888888aa",
    }, coauthor: {
        light: "#888888aa", dark: "#888888aa",
    }, author: {
        light: "#0e80cd", dark: "#0e80cd",
    }, publication: {
        light: "#ff0000", dark: "#ff0000",
    }, venue: {
        SCG: { /* = SoCG up to 19XX */
            publication: {light: "#ff0000", dark: "#ff0000"},
        },
        SoCG: {
            publication: {light: "#ff0000", dark: "#ff0000"},
        }, CCCG: {
            publication: {light: "#ec7637", dark: "#f67a36"},
        }, "J. Comput. Geom.": {
            publication: {light: "#5bbf2e", dark: "#59b730"},
        }
    },
};

export const publication_halflife = 3.8;
export const author_halflife = 6;
console.assert(publication_halflife < author_halflife);