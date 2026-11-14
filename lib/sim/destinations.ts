/**
 * Preset destinations.
 *
 * Images live in public/destinations/<id>/ and are produced by
 * scripts/generate-seeds.mjs. Winston can replace a file in place (same name,
 * 16:9) without touching this manifest. Keep ids, folders and extensions in
 * agreement with the script.
 *
 * Kickoff prompts are hand-written to match the seed images and follow the
 * Orbis guidance: who + what + where + camera, one to three sentences, under
 * about 100 words, physical description, no negation.
 */

import type { Destination } from "./types";

function image(id: string, view: "aerial" | "ground"): string {
  return `/destinations/${id}/${view}.png`;
}

export const DESTINATIONS: Destination[] = [
  {
    id: "paris",
    name: "Paris",
    tagline: "Glide up the Champ de Mars to the Eiffel Tower",
    aerialImage: image("paris", "aerial"),
    groundImage: image("paris", "ground"),
    aerialKickoff:
      "A first-person aerial view from a small aircraft flying forward over Paris on a clear summer day. The Eiffel Tower stands straight ahead at the end of the long green lawns of the Champ de Mars, surrounded by cream stone buildings with gray rooftops that reach the horizon. The camera glides smoothly forward toward the tower as the city flows beneath, photorealistic, in one continuous shot.",
    groundKickoff:
      "A first-person walking view at eye level on a cobblestone street in Paris in bright daylight. Cream stone buildings with wrought-iron balconies and cafe terraces line both sides, and the Eiffel Tower rises at the end of the street. Pedestrians stroll past and leaves stir in a light breeze as the viewer stands looking ahead, photorealistic, in one continuous shot.",
    audioPrompt:
      "Soft city ambience: a light breeze, distant traffic, quiet cafe chatter, clinking cups and a faint accordion far away.",
    guideFacts: [
      "The Eiffel Tower was completed in 1889 for the World's Fair.",
      "The tower stands about 330 meters tall and was the tallest structure in the world until 1930.",
      "The Seine flows through the heart of Paris, and its banks are a UNESCO World Heritage Site.",
      "Paris is nicknamed the City of Light.",
      "The Louvre is the most visited art museum in the world and home to the Mona Lisa.",
    ],
  },
  {
    id: "tokyo",
    name: "Tokyo",
    tagline: "Skim the high-rises toward Tokyo Tower and the bay",
    aerialImage: image("tokyo", "aerial"),
    groundImage: image("tokyo", "ground"),
    aerialKickoff:
      "A first-person aerial view from a small aircraft flying forward over Tokyo on a clear day. The red and white lattice Tokyo Tower stands ahead among dense glass high-rises, a curved elevated expressway carries traffic below, and Tokyo Bay shines along the horizon. The camera glides smoothly forward toward the tower as the city flows beneath, photorealistic, in one continuous shot.",
    groundKickoff:
      "A first-person walking view at eye level on a narrow side street in Tokyo in bright daylight. Small houses, potted plants, vending machines and overhead utility wires line the street, and the red and white Tokyo Tower rises above the rooftops straight ahead. A cyclist rides away and a pedestrian walks along as the viewer stands looking ahead, photorealistic, in one continuous shot.",
    audioPrompt:
      "Calm city ambience: a light breeze, the hum of distant traffic, a bicycle bell, soft footsteps and a faraway train passing.",
    guideFacts: [
      "Tokyo was called Edo until 1868, when it became the imperial capital.",
      "Tokyo Tower was completed in 1958, stands 333 meters tall and was inspired by the Eiffel Tower.",
      "Greater Tokyo is the most populous metropolitan area in the world.",
      "Shibuya Crossing is often called the busiest pedestrian crossing in the world.",
      "On clear days Mount Fuji can be seen from Tokyo, about 100 kilometers away.",
    ],
  },
  {
    id: "los-angeles",
    name: "Los Angeles",
    tagline: "Cross the freeway toward downtown and the mountains",
    aerialImage: image("los-angeles", "aerial"),
    groundImage: image("los-angeles", "ground"),
    aerialKickoff:
      "A first-person aerial view from a small aircraft flying forward over Los Angeles on a clear day. The cluster of downtown skyscrapers stands ahead with the San Gabriel Mountains behind it, and a wide freeway full of cars crosses a vast grid of low houses and palm trees below. The camera glides smoothly forward toward the skyline as the city flows beneath, photorealistic, in one continuous shot.",
    groundKickoff:
      "A first-person walking view at eye level on a wide boulevard in Los Angeles in warm sunlight. Rows of very tall thin palm trees line both sides above low stucco shops and parked cars, and the downtown towers stand at the end of the street. Palm fronds sway and a few people walk the sidewalks as the viewer stands looking ahead, photorealistic, in one continuous shot.",
    audioPrompt:
      "Warm city ambience: a light breeze through palm fronds, steady distant freeway traffic and an occasional car passing.",
    guideFacts: [
      "Los Angeles was founded in 1781 as a Spanish pueblo.",
      "It is the second most populous city in the United States.",
      "The Hollywood Sign went up in 1923 and originally read Hollywoodland.",
      "Griffith Observatory has overlooked the city since 1935.",
      "Los Angeles hosted the Summer Olympics in 1932 and 1984 and will host them again in 2028.",
    ],
  },
  {
    id: "new-york-city",
    name: "New York City",
    tagline: "Fly straight at the Empire State Building over Midtown",
    aerialImage: image("new-york-city", "aerial"),
    groundImage: image("new-york-city", "ground"),
    aerialKickoff:
      "A first-person aerial view from a small aircraft flying forward over Manhattan on a clear day. The Empire State Building stands straight ahead above a dense field of stone and glass towers, with rivers shining on both sides and bridges in the distance. The camera glides smoothly forward toward the spire as the city flows beneath, photorealistic, in one continuous shot.",
    groundKickoff:
      "A first-person walking view at eye level on a broad Manhattan avenue in bright daylight. Yellow taxis roll through traffic between tall stone buildings, steam rises from a street vent, and the Empire State Building towers at the end of the avenue. Crowds of pedestrians move along the sidewalks as the viewer stands looking ahead, photorealistic, in one continuous shot.",
    audioPrompt:
      "Busy city ambience: steady traffic, distant car horns, footsteps and voices on a crowded sidewalk, and wind between tall buildings.",
    guideFacts: [
      "The Empire State Building opened in 1931 and was the tallest building in the world for nearly 40 years.",
      "New York City has five boroughs: Manhattan, Brooklyn, Queens, the Bronx and Staten Island.",
      "The Statue of Liberty was a gift from France and was dedicated in 1886.",
      "The Brooklyn Bridge opened in 1883.",
      "Central Park covers 843 acres in the middle of Manhattan.",
    ],
  },
  {
    id: "boston",
    name: "Boston",
    tagline: "Follow the Charles River past sailboats to Back Bay",
    aerialImage: image("boston", "aerial"),
    groundImage: image("boston", "ground"),
    aerialKickoff:
      "A first-person aerial view from a small aircraft flying forward low over the Charles River in Boston on a clear day. White sailboats dot the blue water, a stone arch bridge crosses ahead, and the Back Bay skyline with its tall blue glass tower rises beyond red brick rowhouses on the bank. The camera glides smoothly forward toward the skyline as the river flows beneath, photorealistic, in one continuous shot.",
    groundKickoff:
      "A first-person walking view at eye level on a narrow cobblestone lane in Boston's Beacon Hill in soft daylight. Red brick rowhouses with black shutters, flower-filled window boxes and black iron gas lamps line both sides under leafy green trees. Leaves rustle and dappled sunlight shifts across the stones as the viewer stands looking ahead, photorealistic, in one continuous shot.",
    audioPrompt:
      "Quiet neighborhood ambience: leaves rustling in a light breeze, birdsong, distant traffic and faint water lapping.",
    guideFacts: [
      "Boston was founded in 1630 and is one of the oldest cities in the United States.",
      "The Boston Tea Party took place in Boston Harbor in 1773.",
      "Boston Common, established in 1634, is the oldest public park in the United States.",
      "Boston's subway opened in 1897 and was the first in the United States.",
      "Fenway Park has been home to the Red Sox since 1912 and is the oldest ballpark in Major League Baseball.",
    ],
  },
  {
    id: "venice-beach",
    name: "Venice Beach",
    tagline: "Cruise the California coastline above sand, surf and palms",
    aerialImage: image("venice-beach", "aerial"),
    groundImage: image("venice-beach", "ground"),
    aerialKickoff:
      "A first-person aerial view from a small aircraft flying forward along the coastline of Venice Beach, California, on a clear day. A wide band of pale sand runs ahead between white Pacific surf on the left and a palm-lined boardwalk with colorful buildings on the right, with a pier and hazy mountains in the distance. The camera glides smoothly forward along the beach as waves roll in below, photorealistic, in one continuous shot.",
    groundKickoff:
      "A first-person walking view at eye level on the Venice Beach boardwalk in California in warm sunlight. Brightly painted shopfronts and tall palm trees line the left side, open sand and the Pacific Ocean stretch to the right, and skaters, cyclists and walkers move along the wide paved path. Palm fronds sway in the sea breeze as the viewer stands looking ahead, photorealistic, in one continuous shot.",
    audioPrompt:
      "Beach ambience: rolling ocean waves, a steady sea breeze, seagulls, skateboard wheels on pavement and distant laughter.",
    guideFacts: [
      "Venice was founded in 1905 by developer Abbot Kinney as a seaside resort.",
      "Kinney had canals dug to echo Venice, Italy, and a few of them still remain.",
      "Venice became part of the city of Los Angeles in 1926.",
      "Muscle Beach Venice is a famous outdoor gym right on the boardwalk.",
      "The Venice Beach Skatepark sits on the sand and opened in 2009.",
    ],
  },
];

export function getDestination(id: string): Destination | undefined {
  return DESTINATIONS.find((destination) => destination.id === id);
}
