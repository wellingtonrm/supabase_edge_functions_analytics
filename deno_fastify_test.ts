import Fastify from "npm:fastify";
const fastify = Fastify({ logger: true });
fastify.get("/", async (request, reply) => {
  return { hello: "world" };
});
console.log("Fastify loaded");
