#![deny(unused_must_use)]
#![deny(for_loops_over_fallibles)]
#![deny(dead_code)]
#![deny(unused_variables)]
#![deny(unused_assignments)]

pub mod absence;
pub mod bodies;
pub mod config;
pub mod helps;
pub mod layers;
pub mod lexical;
pub mod patterns;
pub mod provenance;
pub mod report;
pub mod scan;
pub mod shapes;
pub mod skeleton;
pub mod violation;
pub mod visitor;
