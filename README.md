# The Computational Geometry Community

Explore collaboration in the Computational Geometry community through a dynamic co-authorship network built from open conference data provided by DBLP. The data is aggregated and organized into time-based snapshots, allowing you to discover how collaborative structures form, persist, and dissolve over time. Identify cliques and larger clusters, examine central and bridging researchers, and analyze graph-theoretic measures such as diameter, connectivity, and clustering to investigate whether the community exhibits small-world characteristics such as short collaboration paths combined with strong local structure. Inspired by concepts like the Erdös number, this app provides an interactive and evolving perspective on collaboration in computational geometry.

At launch, the application automatically retrieves all relevant
data from dblp and computes several summary statistics. It also
generates a visualization of the CG community graph for a
randomly selected year.

The web interface offers several tools for exploring the data in
depth. Users can choose between displaying only co-author
relationships or additionally showing the associated
publications, and explore the data set interactively by clicking
directly on any node or edge within the graph. This reveals
detailed information associated with it, and provides even more
options to dig into the data.

A time-range slider allows the user to define a custom interval
over which the data is aggregated and visualized. By pressing
the "Play" button, the selected interval automatically advances
year by year across the full timeline, dynamically updating the
visualization to reflect the active data for the respective
year(s).