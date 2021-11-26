require("dotenv").config();
const axios = require("axios").default;
const connectToMongo = require("./Config/db.js");
const express = require("express");
var config = require("./key.json");
const cors = require("cors");
const { PaymentGateway } = require("@cashfreepayments/cashfree-sdk");
const pug = require("pug");
const path = require("path");
const User_Login_Schema = require("./models/User_Login");
const User_Transaction_Schema = require("./models/Transaction");
const Package = require("./models/Packages");
const cron = require("node-cron");
connectToMongo.connect();
const app = express();
const port = 5000;

app.use(cors());
app.set("view engine", "pug");
app.set("views", path.join(__dirname, "views"));
// app.set("views", path.join(__dirname, "views/assets"));
app.use(express.json());

app.use("/banner", express.static(__dirname + "/upload/images"));
app.use("", express.static(__dirname + "/upload/"));
// app.use("/payment",express.static(__dirname + '/view'));

// Available Routes
app.use("/auth", require("./authrization/routes/authUser"));
app.use("/admindata", require("./authrization/routes/admindata"));
// app.use('/image', require('./routes/banner'))

// Callback payment URL
app.post("/payments/:orderId/:_id", async (req, res) => {
  try {
    // console.log(req);
    console.log("AFTER");
    const pg = await new PaymentGateway({
      env: config.enviornment,
      apiVersion: "1.0.0",
      appId: process.env.PG_App_ID,
      secretKey: process.env.PG_Secret_Id,
    });
    const response = await pg.orders.getStatus({
      orderId: req.params.orderId, // required
    });
    console.log(response);
    if (response.txStatus === "SUCCESS") {
      console.log("SUCCESS");
      const _id = await req.params._id;
      // console.log(_id);
      let plan = await Math.floor(response.orderAmount);
      let packagess = await Package.findOne({ plan });
      // console.log(packagess);
      if (packagess) {
        plan = await packagess.plan;
        // console.log(plan);
        let DateNow = new Date();
        let expireIn = await packagess.expireIn;
        let perDayAddLimit = await packagess.dailyAds;
        let commission = await packagess.commission;
        let date = await DateNow.setDate(DateNow.getDate() + expireIn);
        const planExpireOn = await new Date(date);
        // console.log(date);
        let use = await User_Login_Schema.findById({ _id });
        if (use.plan <= 0) {
          const user = await User_Login_Schema.findByIdAndUpdate(
            { _id },
            {
              plan,
              planExpireOn,
              perDayAddLimit,
              commission,
              status: "active",
            },
            { new: true }
          ).select("-password");
          if (user) console.log(user);
        }
      }
      let users = await _id;
      let remark = await `Thanks for buying our plan`;
      let addTransaction = await User_Transaction_Schema.create({
        users,
        remark,
        amount: plan,
      });
      console.log(addTransaction);
      return res.status(200).render("success", {
        message: `We received your Payment successfully`,
        subMessage: `Thanks for buying our package!`,
      });
    } else if (response.txStatus === "FAILED") {
      console.log("failed");
      return res.status(200).render("failed");
    }
    // console.log(response.data);
  } catch (error) {
    console.error(error);
    res.status(400).json({ error: error.message });
  }
});

// Callback Wallet URL
app.post("/wallet/:orderId/:_id", async (req, res) => {
  try {
    // console.log(req);
    console.log("AFTER Wallet");
    const pg = await new PaymentGateway({
      env: config.enviornment,
      apiVersion: "1.0.0",
      appId: process.env.PG_App_ID,
      secretKey: process.env.PG_Secret_Id,
    });
    const response = await pg.orders.getStatus({
      orderId: req.params.orderId, // required
    });
    console.log(response);
    if (response.txStatus === "SUCCESS") {
      console.log("SUCCESS");
      const _id = await req.params._id;
      let user = await User_Login_Schema.findById({ _id }).select("-password");
      let money = await parseInt(response.orderAmount);
      let wallet = (await user.wallet) + money;
      let walletUser = await User_Login_Schema.findOneAndUpdate(
        { _id },
        { wallet },
        { new: true }
      ).select("-password");
      let users = await _id;
      let remark = await `Add money to wallet`;
      let amount = await response.orderAmount;
      let addTransaction = await User_Transaction_Schema.create({
        users,
        remark,
        amount,
      });
      if (walletUser && addTransaction)
        return res.status(200).render("success", {
          message: `We received ${response.orderAmount} successfully`,
          subMessage: `Thanks for using our app!`,
        });
      if (!walletUser)
        return res.status(400).render("success", {
          message: `We received ${response.orderAmount} successfully`,
          subMessage: `Due to some technical issue your amount is not added to your please contact customer care`,
        });
    } else if (response.txStatus === "FAILED") {
      console.log("failed");
      return res.status(200).render("failed");
    }
    // console.log(response.data);
  } catch (error) {
    console.error(error);
    res.status(400).json({ error: error.message });
  }
});
// app.post("/")
// About page URL
app.get("/about", (req, res) => {
  try {
    return res.redirect("https://www.payucart.com/#about")
    // console.log(response.data);
  } catch (error) {
    console.error(e);
    res.status(400).json({ e });
  }
});

// About term&condition URL
app.get("/term&condition", async (req, res) => {
  try {
    return res.redirect("https://www.payucart.com/#term")
    // console.log(response.data);
  } catch (error) {
    console.error(e);
    res.status(400).json({ e });
  }
});

// About privacy URL
app.get("/privacy", async (req, res) => {
  try {
    return res.redirect("https://www.payucart.com/")
    // console.log(response.data);
  } catch (error) {
    console.error(e);
    res.status(400).json({e});
  }
});

cron.schedule("* * * * *", async () => {
  try {
    let user = await User_Login_Schema.find({ plan: { $gt: 1 } });
    user.map(async (x, n) => {
      let a = new Date();
      let b = new Date(x.planExpireOn);
      let c = b - a;
      // console.log(x.name);
      if (c <= 0) {
        let changes = {
          plan: 0,
          perDayAddLimit: 0,
          planExpireOn: 0,
          commission: 0,
          status: "InActive",
        };
        User_Login_Schema.findByIdAndUpdate({ _id: x._id }, changes)
          .then((res) => {
            console.log(res.name, "Plan Expire");
          })
          .catch((err) => {
            console.log(err, "err");
          });
        // console.log(changes);
      }
    });
  } catch (error) {
    console.log(error);
  }
});

cron.schedule("5 5 0 * * *", async () => {
  try {
    let user = await User_Login_Schema.find({ plan: { $gt: 1 } });
    user.map(async (x, n) => {
      let changes = { perDayAddLimit: 1 };
      await Package.findOne({ plan: x.plan })
        .then((res) => {
          console.log(res.dailyAds, "res.dailyAds");
          changes = {
            perDayAddLimit: res.dailyAds,
            tEarning: 0,
            tcomplete: 0,
            yEarning: x.tEarning
          };
        })
        .catch((err) => {
          console.log("package err", err);
        });
      await User_Login_Schema.findByIdAndUpdate({ _id: x._id }, changes, {
        new: true,
      })
        .then((res) => {
          console.log(res, "addlimit");
          console.log(changes);
        })
        .catch((err) => {
          console.log(err, "err");
        });
      // console.log(changes);
    });
  } catch (error) {
    console.log(error);
  }
});

// app.get('/',(req,res)=>{
//   res.send('welocme')
// })

// Have Node serve the files for our built React app
app.use(express.static(path.resolve(__dirname, './build')));

// Handle GET requests to /api route
// app.get("/api", (req, res) => {
//   res.json({ message: "Hello from server!" });
// });

// All other GET requests not handled before will return our React app
app.get('*', (req, res) => {
  res.sendFile(path.resolve(__dirname, './build','index.html'));
});
app.listen(process.env.PORT || port, () => {
  console.log(`backend listening at port:${process.env.PORT}`);
});
