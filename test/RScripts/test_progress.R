
slow_sum <- function(x) {
  #p <- progressr::progressor(along = x)
  sum <- 0
  Sys.sleep(1)
  sum + 10
  print("progress-Reading Files-0")
  Sys.sleep(1)
  sum + 10
  print("progress-Now processing rest of files-50")
  Sys.sleep(1)
  sum + 10
  print("progress-Almost done...-100")
  Sys.sleep(1)
  sum + 10
  sum
}