VERSION=$(cat version.txt)
docker build --build-arg SELF_HOSTED=true -t baugraph:$VERSION .
