export const notFound = (req, res) => {
  res.status(404).json({ message: "Endpoint not found" });
};

export const errorHandler = (err, req, res, next) => {
  console.error(err);
  const status = err.status || 500;
  res.status(status).json({ message: err.message || "Server error" });
};
