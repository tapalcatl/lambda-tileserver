const app = require("./app");

app.listen(process.env.PORT || 8080, function () {
  console.log("Listening at http://%s:%d/", this.address().address, this.address().port);
});